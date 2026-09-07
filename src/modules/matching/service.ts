import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateQualifications, candidateSkills } from '@/lib/db/schema/candidate_details';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  type CandidateMatch,
  candidateMatches,
  jobRequisitions,
  requisitionQualifications,
  requisitionSkills,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { qualifications, skills } from '@/lib/db/schema/reference';
import { BusinessRuleError } from '@/lib/errors';
import {
  bucketize,
  type CandidateSnapshot,
  type RequisitionSnapshot,
  scoreCandidate,
} from './scoring';

// Re-export pure scoring helpers so existing importers of `service` still work.
export { bucketize, scoreCandidate } from './scoring';

export type MatchListRow = CandidateMatch & {
  personName: string;
  personEmail: string | null;
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED';
};

export async function listMatches(requisitionId: string): Promise<MatchListRow[]> {
  await requireInternalStaff();
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
    .where(
      and(
        eq(candidateMatches.jobRequisitionId, requisitionId),
        isNull(persons.archivedAt),
        isNull(persons.mergedIntoPersonId),
        eq(persons.isDraft, false),
      ),
    )
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
 * upsert matches (existing scores + reasons refreshed, new ones inserted), audit the run.
 */
export async function runAssistedMatching(requisitionId: string): Promise<{ upserted: number }> {
  const session = await requireInternalStaff();
  const [requisition] = await db
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .limit(1);
  if (!requisition) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');

  // Fetch requisition's structured skills + qualifications for matching.
  const [reqSkillRows, reqQualRows] = await Promise.all([
    db
      .select({
        skillId: requisitionSkills.skillId,
        isRequired: requisitionSkills.isRequired,
        name: skills.name,
      })
      .from(requisitionSkills)
      .innerJoin(skills, eq(skills.id, requisitionSkills.skillId))
      .where(eq(requisitionSkills.jobRequisitionId, requisitionId)),
    db
      .select({
        qualificationId: requisitionQualifications.qualificationId,
        isRequired: requisitionQualifications.isRequired,
        name: qualifications.name,
      })
      .from(requisitionQualifications)
      .innerJoin(qualifications, eq(qualifications.id, requisitionQualifications.qualificationId))
      .where(eq(requisitionQualifications.jobRequisitionId, requisitionId)),
  ]);

  const requisitionSnap: RequisitionSnapshot = {
    occupationId: requisition.occupationId,
    location: requisition.location,
    requiredSkillIds: reqSkillRows.filter((r) => r.isRequired).map((r) => r.skillId),
    preferredSkillIds: reqSkillRows.filter((r) => !r.isRequired).map((r) => r.skillId),
    skillNamesById: new Map(reqSkillRows.map((r) => [r.skillId, r.name])),
    requiredQualificationIds: reqQualRows.filter((r) => r.isRequired).map((r) => r.qualificationId),
    preferredQualificationIds: reqQualRows
      .filter((r) => !r.isRequired)
      .map((r) => r.qualificationId),
    qualificationNamesById: new Map(reqQualRows.map((r) => [r.qualificationId, r.name])),
  };

  const candidateRows = await db
    .select({
      personId: candidateProfiles.personId,
      primaryOccupationId: candidateProfiles.primaryOccupationId,
      availabilityStatus: candidateProfiles.availabilityStatus,
      lifecycleStatus: candidateProfiles.lifecycleStatus,
      preferredLocation: candidateProfiles.preferredLocation,
    })
    .from(candidateProfiles)
    .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
    // Skip draft, archived, and merged persons — matching must not score
    // half-filled onboarding drafts or candidates staff have retired.
    .where(
      and(
        eq(persons.isDraft, false),
        isNull(persons.mergedIntoPersonId),
        isNull(persons.archivedAt),
      ),
    );

  if (candidateRows.length === 0) return { upserted: 0 };

  const personIds = candidateRows.map((c) => c.personId);
  const [allSkillRows, allQualRows] = await Promise.all([
    db
      .select({ personId: candidateSkills.personId, skillId: candidateSkills.skillId })
      .from(candidateSkills)
      .where(inArray(candidateSkills.personId, personIds)),
    db
      .select({
        personId: candidateQualifications.personId,
        qualificationId: candidateQualifications.qualificationId,
      })
      .from(candidateQualifications)
      .where(inArray(candidateQualifications.personId, personIds)),
  ]);

  const skillsByPerson = new Map<string, Set<string>>();
  for (const r of allSkillRows) {
    const s = skillsByPerson.get(r.personId) ?? new Set<string>();
    s.add(r.skillId);
    skillsByPerson.set(r.personId, s);
  }
  const qualsByPerson = new Map<string, Set<string>>();
  for (const r of allQualRows) {
    const s = qualsByPerson.get(r.personId) ?? new Set<string>();
    s.add(r.qualificationId);
    qualsByPerson.set(r.personId, s);
  }

  const scored = candidateRows.map((c) => {
    const snap: CandidateSnapshot = {
      personId: c.personId,
      primaryOccupationId: c.primaryOccupationId,
      availabilityStatus: c.availabilityStatus,
      lifecycleStatus: c.lifecycleStatus,
      preferredLocation: c.preferredLocation,
      skillIds: skillsByPerson.get(c.personId) ?? new Set(),
      qualificationIds: qualsByPerson.get(c.personId) ?? new Set(),
    };
    return { personId: c.personId, ...scoreCandidate(snap, requisitionSnap) };
  });

  const meaningful = scored.filter((s) => s.score > 0);
  if (meaningful.length === 0) return { upserted: 0 };

  return db.transaction(async (tx) => {
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
          .set({
            score: m.score,
            scoreBucket: bucket,
            source: 'ASSISTED',
            reasons: m.reasons,
            updatedAt: sql`NOW()`,
          })
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
          reasons: m.reasons,
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
      context: {
        upserted,
        candidatesScored: candidateRows.length,
        requiredSkills: requisitionSnap.requiredSkillIds.length,
        requiredQualifications: requisitionSnap.requiredQualificationIds.length,
      },
    });

    return { upserted };
  });
}

export async function shortlistMatch(matchId: string) {
  const session = await requireInternalStaff();
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
  const session = await requireInternalStaff();
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

/**
 * Remove a shortlist entry — reverse of shortlistMatch. Deletes the
 * shortlistEntries row and flips the underlying match back to REVIEWED so
 * staff can decide again (rather than reappearing as fresh SUGGESTED).
 */
export async function removeFromShortlist(shortlistEntryId: string, reason?: string) {
  const session = await requireInternalStaff();
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(shortlistEntries)
      .where(eq(shortlistEntries.id, shortlistEntryId))
      .limit(1);
    if (!entry) throw new BusinessRuleError('SHORTLIST_NOT_FOUND', 'Shortlist entry not found');

    await tx.delete(shortlistEntries).where(eq(shortlistEntries.id, shortlistEntryId));

    // If a candidate_match still exists, flip it out of the SHORTLISTED state.
    if (entry.candidateMatchId) {
      await tx
        .update(candidateMatches)
        .set({ status: 'REVIEWED', updatedAt: sql`NOW()` })
        .where(eq(candidateMatches.id, entry.candidateMatchId));
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'shortlist_entry',
      entityId: entry.id,
      action: 'DELETED',
      before: { jobRequisitionId: entry.jobRequisitionId, personId: entry.personId },
      context: reason ? { reason } : undefined,
    });

    return { ok: true };
  });
}
