import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  type CandidateMatch,
  candidateMatches,
  jobRequisitions,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Deterministic scoring for a person against a requisition.
 * Weights (tunable in a future admin UI; recorded here for transparency):
 *   - Same primary occupation as requisition            : +60
 *   - Availability = AVAILABLE                          : +25 (hard-ish signal)
 *   - Lifecycle ACTIVE                                  : +10
 *   - Preferred location contains requisition location  : +5
 *
 * Bucketing:  >= 70 HIGH  |  40–69 MEDIUM  |  0–39 LOW
 */
function bucketize(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

export type MatchListRow = CandidateMatch & {
  personName: string;
  personEmail: string | null;
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED';
};

export async function listMatches(requisitionId: string): Promise<MatchListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      match: candidateMatches,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      availabilityStatus: candidateProfiles.availabilityStatus,
    })
    .from(candidateMatches)
    .innerJoin(persons, eq(persons.id, candidateMatches.personId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, candidateMatches.personId))
    .where(eq(candidateMatches.jobRequisitionId, requisitionId))
    .orderBy(desc(candidateMatches.score));
  return rows.map((r) => ({
    ...r.match,
    personName: `${r.firstName} ${r.lastName}`,
    personEmail: r.email,
    availabilityStatus: r.availabilityStatus ?? 'AVAILABLE',
  }));
}

/**
 * Run assisted matching for a requisition: score every active-available candidate,
 * upsert matches (existing scores refreshed, new ones inserted), audit the run.
 */
export async function runAssistedMatching(requisitionId: string): Promise<{ upserted: number }> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const [requisition] = await db
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .limit(1);
  if (!requisition) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');

  const candidates = await db
    .select({
      personId: candidateProfiles.personId,
      primaryOccupationId: candidateProfiles.primaryOccupationId,
      availabilityStatus: candidateProfiles.availabilityStatus,
      lifecycleStatus: candidateProfiles.lifecycleStatus,
      preferredLocation: candidateProfiles.preferredLocation,
      mergedIntoPersonId: persons.mergedIntoPersonId,
    })
    .from(candidateProfiles)
    .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
    .where(isNull(persons.mergedIntoPersonId));

  const reqLocation = requisition.location?.toLowerCase() ?? '';

  const scored = candidates.map((c) => {
    let score = 0;
    if (requisition.occupationId && c.primaryOccupationId === requisition.occupationId) score += 60;
    if (c.availabilityStatus === 'AVAILABLE') score += 25;
    if (c.lifecycleStatus === 'ACTIVE') score += 10;
    if (reqLocation && c.preferredLocation?.toLowerCase().includes(reqLocation)) score += 5;
    return { personId: c.personId, score };
  });

  const meaningful = scored.filter((s) => s.score > 0);
  if (meaningful.length === 0) return { upserted: 0 };

  return db.transaction(async (tx) => {
    // Refresh existing matches for these persons on this requisition; insert missing ones.
    const existingIds = await tx
      .select({ personId: candidateMatches.personId })
      .from(candidateMatches)
      .where(
        and(
          eq(candidateMatches.jobRequisitionId, requisitionId),
          inArray(
            candidateMatches.personId,
            meaningful.map((m) => m.personId),
          ),
        ),
      );
    const existingSet = new Set(existingIds.map((r) => r.personId));

    let upserted = 0;
    for (const m of meaningful) {
      const bucket = bucketize(m.score);
      if (existingSet.has(m.personId)) {
        await tx
          .update(candidateMatches)
          .set({ score: m.score, scoreBucket: bucket, source: 'ASSISTED', updatedAt: sql`NOW()` })
          .where(
            and(
              eq(candidateMatches.jobRequisitionId, requisitionId),
              eq(candidateMatches.personId, m.personId),
            ),
          );
      } else {
        await tx.insert(candidateMatches).values({
          jobRequisitionId: requisitionId,
          personId: m.personId,
          score: m.score,
          scoreBucket: bucket,
          source: 'ASSISTED',
          suggestedByUserId: session.user.id,
        });
      }
      upserted += 1;
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: requisitionId,
      action: 'MATCHING_RUN',
      context: { upserted, candidatesScored: candidates.length },
    });

    return { upserted };
  });
}

export async function shortlistMatch(matchId: string) {
  const session = await requireRole(['ADMIN', 'STAFF']);
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(candidateMatches)
      .where(eq(candidateMatches.id, matchId))
      .limit(1);
    if (!m) throw new BusinessRuleError('MATCH_NOT_FOUND', 'Match not found');

    // Idempotent: if already shortlisted, no-op.
    const [existing] = await tx
      .select()
      .from(shortlistEntries)
      .where(
        and(
          eq(shortlistEntries.jobRequisitionId, m.jobRequisitionId),
          eq(shortlistEntries.personId, m.personId),
        ),
      )
      .limit(1);

    if (!existing) {
      const [entry] = await tx
        .insert(shortlistEntries)
        .values({
          jobRequisitionId: m.jobRequisitionId,
          personId: m.personId,
          candidateMatchId: m.id,
        })
        .returning();
      if (!entry) throw new Error('shortlist insert returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'shortlist_entry',
        entityId: entry.id,
        action: 'CREATED',
        after: { jobRequisitionId: entry.jobRequisitionId, personId: entry.personId },
      });
    }

    await tx
      .update(candidateMatches)
      .set({ status: 'SHORTLISTED', updatedAt: sql`NOW()` })
      .where(eq(candidateMatches.id, matchId));

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_match',
      entityId: matchId,
      action: 'SHORTLISTED',
    });

    return { ok: true };
  });
}

export async function dismissMatch(matchId: string) {
  const session = await requireRole(['ADMIN', 'STAFF']);
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(candidateMatches)
      .where(eq(candidateMatches.id, matchId))
      .limit(1);
    if (!m) throw new BusinessRuleError('MATCH_NOT_FOUND', 'Match not found');
    await tx
      .update(candidateMatches)
      .set({ status: 'DISMISSED', updatedAt: sql`NOW()` })
      .where(eq(candidateMatches.id, matchId));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_match',
      entityId: matchId,
      action: 'DISMISSED',
    });
    return { ok: true };
  });
}
