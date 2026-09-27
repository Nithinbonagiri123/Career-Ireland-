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

  // Free-text candidate skills / qualifications (custom_name set, no catalog
  // id) can't participate in matching — matching is by canonical id, and
  // there's nothing to compare a free-text label against. Skip nulls.
  const skillsByPerson = new Map<string, Set<string>>();
  for (const r of allSkillRows) {
    if (r.skillId === null) continue;
    const s = skillsByPerson.get(r.personId) ?? new Set<string>();
    s.add(r.skillId);
    skillsByPerson.set(r.personId, s);
  }
  const qualsByPerson = new Map<string, Set<string>>();
  for (const r of allQualRows) {
    if (r.qualificationId === null) continue;
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
 * Manually add a candidate to a requisition's shortlist — for when staff
 * already know the right person and want to skip the scored matcher
 * output. Idempotent + safe against a re-add of a previously dismissed
 * candidate (flips the existing candidate_matches row back to
 * SHORTLISTED). Score is left at 0 with source=MANUAL so pipeline UIs
 * can distinguish these from ASSISTED matches if they want to.
 *
 * Guarantees post-condition:
 *   - one candidate_matches row exists with status=SHORTLISTED
 *   - one shortlist_entries row exists linking match → person → requisition
 *   - both events audited
 */
export async function manuallyShortlistPerson(personId: string, requisitionId: string) {
  const session = await requireInternalStaff();
  return db.transaction(async (tx) => {
    // Sanity: requisition + person exist, person is a live non-draft
    // candidate. We only need to reject the truly-broken cases here —
    // referential integrity is enforced by FKs.
    const [reqRow] = await tx
      .select({ id: jobRequisitions.id })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.id, requisitionId))
      .limit(1);
    if (!reqRow) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');

    const [personRow] = await tx
      .select({
        id: persons.id,
        isDraft: persons.isDraft,
        archivedAt: persons.archivedAt,
        mergedIntoPersonId: persons.mergedIntoPersonId,
      })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1);
    if (!personRow) throw new BusinessRuleError('PERSON_NOT_FOUND', 'Candidate not found');
    if (personRow.isDraft)
      throw new BusinessRuleError('PERSON_IS_DRAFT', 'Draft candidates cannot be shortlisted');
    if (personRow.archivedAt)
      throw new BusinessRuleError('PERSON_ARCHIVED', 'Archived candidates cannot be shortlisted');
    if (personRow.mergedIntoPersonId)
      throw new BusinessRuleError(
        'PERSON_MERGED',
        'Merged candidates cannot be shortlisted — use the canonical record',
      );

    // Upsert the candidate_matches row (unique on requisitionId + personId).
    // If it already exists we flip status → SHORTLISTED and record the
    // manual re-add; otherwise insert a fresh MANUAL row.
    const [existingMatch] = await tx
      .select()
      .from(candidateMatches)
      .where(
        and(
          eq(candidateMatches.jobRequisitionId, requisitionId),
          eq(candidateMatches.personId, personId),
        ),
      )
      .limit(1);

    let matchId: string;
    if (existingMatch) {
      matchId = existingMatch.id;
      if (existingMatch.status !== 'SHORTLISTED') {
        await tx
          .update(candidateMatches)
          .set({ status: 'SHORTLISTED', updatedAt: sql`NOW()` })
          .where(eq(candidateMatches.id, matchId));
      }
    } else {
      const [inserted] = await tx
        .insert(candidateMatches)
        .values({
          jobRequisitionId: requisitionId,
          personId,
          score: 0,
          scoreBucket: 'LOW',
          source: 'MANUAL',
          status: 'SHORTLISTED',
          reasons: [],
          suggestedByUserId: session.user.id,
        })
        .returning({ id: candidateMatches.id });
      if (!inserted) throw new Error('candidate_matches insert returned no row');
      matchId = inserted.id;
    }

    // Insert the shortlist row if it doesn't already exist. Same
    // idempotency guarantee as shortlistMatch.
    const [existingShortlist] = await tx
      .select()
      .from(shortlistEntries)
      .where(
        and(
          eq(shortlistEntries.jobRequisitionId, requisitionId),
          eq(shortlistEntries.personId, personId),
        ),
      )
      .limit(1);

    if (!existingShortlist) {
      const [entry] = await tx
        .insert(shortlistEntries)
        .values({ jobRequisitionId: requisitionId, personId, candidateMatchId: matchId })
        .returning();
      if (!entry) throw new Error('shortlist insert returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'shortlist_entry',
        entityId: entry.id,
        action: 'CREATED',
        after: { jobRequisitionId: entry.jobRequisitionId, personId: entry.personId },
        context: { via: 'manual_add' },
      });
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_match',
      entityId: matchId,
      action: existingMatch ? 'SHORTLISTED' : 'CREATED',
      context: { source: 'MANUAL', via: 'manual_add' },
    });

    return { ok: true, matchId };
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
