import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { todayInDublin } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { candidateQualifications, candidateSkills } from '@/lib/db/schema/candidate_details';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  type CandidateMatch,
  candidateMatches,
  jobApplications,
  jobRequisitions,
  placements,
  requisitionQualifications,
  requisitionSkills,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { qualifications, skills } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { BUSINESS_TIMEZONE, formatZoned, zonedLocalToUtc } from '@/lib/zoned-time';
import { lockJobForPipelineWork } from '@/modules/pipeline/job-guard';
import {
  type RecordFeedbackInput,
  RecordFeedbackSchema,
  type RecordPresentedInput,
  RecordPresentedSchema,
  type RemoveFromShortlistInput,
  RemoveFromShortlistSchema,
  type RunMatchingInput,
  RunMatchingSchema,
} from './schemas';
import {
  bucketize,
  type CandidateSnapshot,
  type RequisitionSnapshot,
  scoreCandidate,
} from './scoring';

// Re-export pure scoring helpers so existing importers of `service` still work.
export { bucketize, scoreCandidate } from './scoring';

/**
 * R5 — matching & shortlists.
 *  - Writes need recruitment.matching (edit); reads used by the job
 *    workspace stay open to internal staff, the global workspaces need
 *    recruitment.matching (view).
 *  - New matching and new shortlisting are refused on closed / cancelled
 *    jobs; existing history is kept.
 *  - A run is serialised per job (row lock) and upserts on the
 *    (job, person) unique key, so concurrent or repeated runs are safe and
 *    give the same result. Manual matches keep their MANUAL origin.
 *  - Confirmed-placed and explicitly unavailable candidates are left out of
 *    new results unless the run asks to include them.
 */

function parseOrThrow<T>(schema: ZodType<T>, input: unknown, message: string): T {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.map(String).join('.') || 'form';
    fields[key] ??= issue.message;
  }
  throw new ValidationError(Object.values(fields)[0] ?? message, fields);
}

const requireMatchingEdit = () => requirePermission('recruitment', 'matching', 'edit');

/** Locks the job row and refuses closed / cancelled jobs for new matching work. */
async function lockOpenRequisition(tx: DbExecutor, requisitionId: string) {
  const [req] = await tx
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .for('update')
    .limit(1);
  if (!req) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
  if (req.status === 'CLOSED' || req.status === 'CANCELLED') {
    throw new BusinessRuleError(
      'REQUISITION_NOT_ACTIVE',
      `This job is ${req.status.toLowerCase()} — matching and new shortlisting are closed. Its history is kept.`,
    );
  }
  return req;
}

/** SQL: the person holds a live confirmed / started placement anywhere. */
const confirmedPlacedSql = (personIdCol: unknown) =>
  sql<boolean>`EXISTS (SELECT 1 FROM placements pl WHERE pl.person_id = ${personIdCol} AND pl.status IN ('CONFIRMED','STARTED') AND pl.archived_at IS NULL)`;

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

export type MatchingRunResult = {
  /** Rows written this run (created + refreshed). */
  upserted: number;
  created: number;
  refreshed: number;
  /** New candidates who scored below the minimum and were not added. */
  belowThreshold: number;
  minScore: number;
  excluded: number;
  candidatesScored: number;
};

/**
 * Run assisted matching for a job: score candidates, upsert matches
 * (scores + reasons refreshed, status and origin preserved), audit the run.
 */
export async function runAssistedMatching(
  input: RunMatchingInput | string,
): Promise<MatchingRunResult> {
  const d = parseOrThrow(
    RunMatchingSchema,
    typeof input === 'string' ? { requisitionId: input } : input,
    'Invalid matching request',
  );
  const session = await requireMatchingEdit();

  return db.transaction(async (tx) => {
    // Serialises runs for this job: a second concurrent run waits here and
    // then recomputes from the same data.
    const requisition = await lockOpenRequisition(tx, d.requisitionId);

    const [reqSkillRows, reqQualRows] = await Promise.all([
      tx
        .select({
          skillId: requisitionSkills.skillId,
          isRequired: requisitionSkills.isRequired,
          name: skills.name,
        })
        .from(requisitionSkills)
        .innerJoin(skills, eq(skills.id, requisitionSkills.skillId))
        .where(eq(requisitionSkills.jobRequisitionId, d.requisitionId)),
      tx
        .select({
          qualificationId: requisitionQualifications.qualificationId,
          isRequired: requisitionQualifications.isRequired,
          name: qualifications.name,
        })
        .from(requisitionQualifications)
        .innerJoin(qualifications, eq(qualifications.id, requisitionQualifications.qualificationId))
        .where(eq(requisitionQualifications.jobRequisitionId, d.requisitionId)),
    ]);

    const requisitionSnap: RequisitionSnapshot = {
      occupationId: requisition.occupationId,
      location: requisition.location,
      requiredSkillIds: reqSkillRows.filter((r) => r.isRequired).map((r) => r.skillId),
      preferredSkillIds: reqSkillRows.filter((r) => !r.isRequired).map((r) => r.skillId),
      skillNamesById: new Map(reqSkillRows.map((r) => [r.skillId, r.name])),
      requiredQualificationIds: reqQualRows
        .filter((r) => r.isRequired)
        .map((r) => r.qualificationId),
      preferredQualificationIds: reqQualRows
        .filter((r) => !r.isRequired)
        .map((r) => r.qualificationId),
      qualificationNamesById: new Map(reqQualRows.map((r) => [r.qualificationId, r.name])),
    };

    // Draft, archived and merged persons are never scored.
    const allCandidates = await tx
      .select({
        personId: candidateProfiles.personId,
        primaryOccupationId: candidateProfiles.primaryOccupationId,
        availabilityStatus: candidateProfiles.availabilityStatus,
        lifecycleStatus: candidateProfiles.lifecycleStatus,
        preferredLocation: candidateProfiles.preferredLocation,
        confirmedPlaced: confirmedPlacedSql(candidateProfiles.personId),
      })
      .from(candidateProfiles)
      .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
      .where(
        and(
          eq(persons.isDraft, false),
          isNull(persons.mergedIntoPersonId),
          isNull(persons.archivedAt),
        ),
      )
      // Hold the scored people until commit so none can be hard-deleted
      // mid-run (which would fail the whole run on the foreign key).
      .for('key share', { of: persons });

    // Default exclusions: confirmed placed (live placement or availability
    // PLACED) and explicitly unavailable. Unknown availability stays in.
    const candidateRows = d.includeUnavailable
      ? allCandidates
      : allCandidates.filter(
          (c) =>
            !c.confirmedPlaced &&
            c.availabilityStatus !== 'PLACED' &&
            c.availabilityStatus !== 'TEMPORARILY_UNAVAILABLE',
        );
    const excluded = allCandidates.length - candidateRows.length;

    const personIds = candidateRows.map((c) => c.personId);
    const [allSkillRows, allQualRows] =
      personIds.length === 0
        ? [[], []]
        : await Promise.all([
            tx
              .select({ personId: candidateSkills.personId, skillId: candidateSkills.skillId })
              .from(candidateSkills)
              .where(inArray(candidateSkills.personId, personIds)),
            tx
              .select({
                personId: candidateQualifications.personId,
                qualificationId: candidateQualifications.qualificationId,
              })
              .from(candidateQualifications)
              .where(inArray(candidateQualifications.personId, personIds)),
          ]);

    // Free-text skills / qualifications (no catalogue id) cannot be compared.
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

    const meaningful = candidateRows
      .map((c) => {
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
      })
      .filter((s) => s.score > 0);

    // Minimum score applies to NEW matches only: anyone already matched on
    // this job keeps their row and gets a refreshed score (never removed).
    const existingRows = await tx
      .select({ personId: candidateMatches.personId })
      .from(candidateMatches)
      .where(eq(candidateMatches.jobRequisitionId, d.requisitionId));
    const alreadyMatched = new Set(existingRows.map((r) => r.personId));
    const toWrite = meaningful.filter(
      (s) => alreadyMatched.has(s.personId) || s.score >= d.minScore,
    );
    const belowThreshold = meaningful.length - toWrite.length;
    const created = toWrite.filter((s) => !alreadyMatched.has(s.personId)).length;

    // Upsert on the (job, person) unique key. On conflict only the score
    // and reasons change: status, origin (MANUAL stays MANUAL) and who
    // suggested it are preserved.
    for (const m of toWrite) {
      await tx
        .insert(candidateMatches)
        .values({
          jobRequisitionId: d.requisitionId,
          personId: m.personId,
          score: m.score,
          scoreBucket: bucketize(m.score),
          source: 'ASSISTED',
          reasons: m.reasons,
          suggestedByUserId: session.user.id,
        })
        .onConflictDoUpdate({
          target: [candidateMatches.jobRequisitionId, candidateMatches.personId],
          set: {
            score: m.score,
            scoreBucket: bucketize(m.score),
            reasons: m.reasons,
            updatedAt: sql`NOW()`,
          },
        });
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: d.requisitionId,
      action: 'MATCHING_RUN',
      context: {
        upserted: toWrite.length,
        created,
        refreshed: toWrite.length - created,
        belowThreshold,
        minScore: d.minScore,
        candidatesScored: candidateRows.length,
        excluded,
        includeUnavailable: Boolean(d.includeUnavailable),
        requiredSkills: requisitionSnap.requiredSkillIds.length,
        requiredQualifications: requisitionSnap.requiredQualificationIds.length,
      },
    });

    return {
      upserted: toWrite.length,
      created,
      refreshed: toWrite.length - created,
      belowThreshold,
      minScore: d.minScore,
      excluded,
      candidatesScored: candidateRows.length,
    };
  });
}

/** Insert the shortlist row once (idempotent on the (job, person) unique key). */
async function ensureShortlistEntry(
  tx: DbExecutor,
  actorUserId: string,
  values: { jobRequisitionId: string; personId: string; candidateMatchId: string },
  via: string,
) {
  const [entry] = await tx
    .insert(shortlistEntries)
    .values(values)
    .onConflictDoNothing({
      target: [shortlistEntries.jobRequisitionId, shortlistEntries.personId],
    })
    .returning();
  if (entry) {
    await recordAudit(tx, {
      actorUserId,
      entityType: 'shortlist_entry',
      entityId: entry.id,
      action: 'CREATED',
      after: { jobRequisitionId: entry.jobRequisitionId, personId: entry.personId },
      context: { via },
    });
  }
  return entry ?? null;
}

export async function shortlistMatch(matchId: string) {
  const session = await requireMatchingEdit();
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(candidateMatches)
      .where(eq(candidateMatches.id, matchId))
      .limit(1);
    if (!m) throw new BusinessRuleError('MATCH_NOT_FOUND', 'Match not found');
    // P0 — shortlisting is pipeline work: refused on draft, closed,
    // cancelled, filled and archived jobs.
    await lockJobForPipelineWork(tx, m.jobRequisitionId, 'add');
    await ensureShortlistEntry(
      tx,
      session.user.id,
      { jobRequisitionId: m.jobRequisitionId, personId: m.personId, candidateMatchId: m.id },
      'match',
    );
    if (m.status !== 'SHORTLISTED') {
      await tx
        .update(candidateMatches)
        .set({ status: 'SHORTLISTED', updatedAt: sql`NOW()` })
        .where(eq(candidateMatches.id, matchId));
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_match',
        entityId: matchId,
        action: 'SHORTLISTED',
        before: { status: m.status },
        after: { status: 'SHORTLISTED' },
      });
    }
    return { ok: true };
  });
}

export async function dismissMatch(matchId: string) {
  const session = await requireMatchingEdit();
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(candidateMatches)
      .where(eq(candidateMatches.id, matchId))
      .for('update')
      .limit(1);
    if (!m) throw new BusinessRuleError('MATCH_NOT_FOUND', 'Match not found');
    if (m.status === 'SHORTLISTED') {
      throw new BusinessRuleError(
        'MATCH_SHORTLISTED',
        'This candidate is shortlisted — remove them from the shortlist (with a reason) instead',
      );
    }
    if (m.status === 'DISMISSED') return { ok: true };
    await tx
      .update(candidateMatches)
      .set({ status: 'DISMISSED', updatedAt: sql`NOW()` })
      .where(eq(candidateMatches.id, matchId));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_match',
      entityId: matchId,
      action: 'DISMISSED',
      before: { status: m.status },
      after: { status: 'DISMISSED' },
    });
    return { ok: true };
  });
}

/** Where a person already sits on a job, in the pipeline wall's words. */
export type PipelineStageLabel = 'Shortlisted' | 'Applied' | 'Interview' | 'Offer' | 'Placed';

/**
 * P0 — what "Add candidate" actually did, so the dialog can say the truth
 * instead of always "added to Shortlisted".
 *  - added             new shortlist (a fresh MANUAL match, or a suggested match)
 *  - reactivated       a dismissed / removed-from-shortlist match put back
 *  - already_at_stage  nothing changed; they are already on the job
 *  - refused           nothing changed; `code` says why
 */
export type ManualAddResult =
  | { ok: true; outcome: 'added'; matchId: string }
  | { ok: true; outcome: 'reactivated'; matchId: string; previousStatus: 'DISMISSED' | 'REVIEWED' }
  | { ok: true; outcome: 'already_at_stage'; stage: PipelineStageLabel }
  | {
      ok: true;
      outcome: 'refused';
      code: 'APPLICATION_CLOSED' | 'AVAILABILITY_CONFIRMATION_REQUIRED';
      reason: string;
    };

const APPLICATION_STAGE: Record<string, PipelineStageLabel> = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Applied',
  SHORTLISTED: 'Applied',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  ACCEPTED: 'Offer',
};

/**
 * Manually add a candidate to a job's shortlist (staff already know the
 * right person). Leaves one SHORTLISTED match (MANUAL when new) and one
 * shortlist row; both audited. Refused (thrown) on draft, closed,
 * cancelled, filled or archived jobs and for draft / archived / merged
 * people. Returns the real outcome (see ManualAddResult); a no-op writes
 * no audit row. A placed or unavailable candidate needs
 * `confirmAvailability` — legitimate manual assignment stays possible and
 * the override is recorded in the audit context.
 */
export async function manuallyShortlistPerson(
  personId: string,
  requisitionId: string,
  opts: { confirmAvailability?: boolean } = {},
): Promise<ManualAddResult> {
  const session = await requireMatchingEdit();
  return db.transaction(async (tx) => {
    await lockJobForPipelineWork(tx, requisitionId, 'add');

    const [personRow] = await tx
      .select({
        id: persons.id,
        firstName: persons.firstName,
        lastName: persons.lastName,
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
    const name = `${personRow.firstName} ${personRow.lastName}`;

    // Already further along on THIS job? Same precedence as the wall.
    const [placedHere] = await tx
      .select({ id: placements.id })
      .from(placements)
      .where(
        and(
          eq(placements.jobRequisitionId, requisitionId),
          eq(placements.personId, personId),
          inArray(placements.status, ['CONFIRMED', 'STARTED', 'COMPLETED']),
          isNull(placements.archivedAt),
        ),
      )
      .limit(1);
    if (placedHere) return { ok: true, outcome: 'already_at_stage', stage: 'Placed' };

    const [application] = await tx
      .select({
        status: jobApplications.status,
        updatedAt: jobApplications.updatedAt,
      })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.jobRequisitionId, requisitionId),
          eq(jobApplications.personId, personId),
        ),
      )
      .limit(1);
    if (application) {
      if (application.status === 'REJECTED' || application.status === 'WITHDRAWN') {
        return {
          ok: true,
          outcome: 'refused',
          code: 'APPLICATION_CLOSED',
          reason: `${name}'s application on this job was ${application.status === 'REJECTED' ? 'rejected' : 'withdrawn'} (last updated ${formatZoned(application.updatedAt)}). A closed application can't be reopened from here.`,
        };
      }
      return {
        ok: true,
        outcome: 'already_at_stage',
        stage: APPLICATION_STAGE[application.status] ?? 'Applied',
      };
    }

    const [entry] = await tx
      .select({ id: shortlistEntries.id })
      .from(shortlistEntries)
      .where(
        and(
          eq(shortlistEntries.jobRequisitionId, requisitionId),
          eq(shortlistEntries.personId, personId),
        ),
      )
      .limit(1);
    if (entry) return { ok: true, outcome: 'already_at_stage', stage: 'Shortlisted' };

    // Placed elsewhere or marked unavailable: legitimate, but deliberate.
    const [profile] = await tx
      .select({ availabilityStatus: candidateProfiles.availabilityStatus })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, personId))
      .limit(1);
    const [placedElsewhere] = await tx
      .select({ id: placements.id })
      .from(placements)
      .where(
        and(
          eq(placements.personId, personId),
          inArray(placements.status, ['CONFIRMED', 'STARTED']),
          isNull(placements.archivedAt),
        ),
      )
      .limit(1);
    const availability =
      profile?.availabilityStatus === 'PLACED' || placedElsewhere
        ? 'PLACED'
        : profile?.availabilityStatus === 'TEMPORARILY_UNAVAILABLE'
          ? 'TEMPORARILY_UNAVAILABLE'
          : 'AVAILABLE';
    if (availability !== 'AVAILABLE' && !opts.confirmAvailability) {
      return {
        ok: true,
        outcome: 'refused',
        code: 'AVAILABILITY_CONFIRMATION_REQUIRED',
        reason:
          availability === 'PLACED'
            ? `${name} is currently placed. Tick the confirmation to add them anyway — it is recorded in the audit log.`
            : `${name} is marked temporarily unavailable. Tick the confirmation to add them anyway — it is recorded in the audit log.`,
      };
    }

    const [prior] = await tx
      .select({ id: candidateMatches.id, status: candidateMatches.status })
      .from(candidateMatches)
      .where(
        and(
          eq(candidateMatches.jobRequisitionId, requisitionId),
          eq(candidateMatches.personId, personId),
        ),
      )
      .limit(1);

    const [match] = await tx
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
      .onConflictDoUpdate({
        target: [candidateMatches.jobRequisitionId, candidateMatches.personId],
        set: { status: 'SHORTLISTED', updatedAt: sql`NOW()` },
      })
      .returning({ id: candidateMatches.id });
    if (!match) throw new Error('candidate_matches upsert returned no row');

    await ensureShortlistEntry(
      tx,
      session.user.id,
      { jobRequisitionId: requisitionId, personId, candidateMatchId: match.id },
      'manual_add',
    );
    const reactivated = prior?.status === 'DISMISSED' || prior?.status === 'REVIEWED';
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_match',
      entityId: match.id,
      action: 'SHORTLISTED',
      before: prior ? { status: prior.status } : undefined,
      after: { status: 'SHORTLISTED' },
      context: {
        via: 'manual_add',
        outcome: reactivated ? 'reactivated' : 'added',
        ...(availability !== 'AVAILABLE'
          ? { overrideAvailability: true, availabilityStatus: availability }
          : {}),
      },
    });
    if (reactivated && prior) {
      return {
        ok: true,
        outcome: 'reactivated',
        matchId: match.id,
        previousStatus: prior.status as 'DISMISSED' | 'REVIEWED',
      };
    }
    return { ok: true, outcome: 'added', matchId: match.id };
  });
}

async function lockShortlistEntry(tx: DbExecutor, id: string) {
  const [entry] = await tx
    .select()
    .from(shortlistEntries)
    .where(eq(shortlistEntries.id, id))
    .for('update')
    .limit(1);
  if (!entry) throw new BusinessRuleError('SHORTLIST_NOT_FOUND', 'Shortlist entry not found');
  return entry;
}

/**
 * Remove a shortlist entry (existing behaviour: the row is deleted and the
 * match goes back to REVIEWED). A reason is required, and an immutable
 * snapshot of the entry is written to the audit log in the SAME
 * transaction — if either step fails, both roll back.
 */
export async function removeFromShortlist(input: RemoveFromShortlistInput) {
  const d = parseOrThrow(RemoveFromShortlistSchema, input, 'Invalid removal');
  const session = await requireMatchingEdit();
  return db.transaction(async (tx) => {
    const entry = await lockShortlistEntry(tx, d.shortlistEntryId);
    const [ctx] = await tx
      .select({
        firstName: persons.firstName,
        lastName: persons.lastName,
        email: persons.email,
        title: jobRequisitions.title,
        employerId: jobRequisitions.employerId,
      })
      .from(persons)
      .innerJoin(jobRequisitions, eq(jobRequisitions.id, entry.jobRequisitionId))
      .where(eq(persons.id, entry.personId))
      .limit(1);

    await tx.delete(shortlistEntries).where(eq(shortlistEntries.id, entry.id));
    if (entry.candidateMatchId) {
      await tx
        .update(candidateMatches)
        .set({ status: 'REVIEWED', updatedAt: sql`NOW()` })
        .where(eq(candidateMatches.id, entry.candidateMatchId));
    }

    const removedAt = new Date();
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'shortlist_entry',
      entityId: entry.id,
      action: 'REMOVED',
      before: {
        shortlistEntryId: entry.id,
        jobRequisitionId: entry.jobRequisitionId,
        requisitionTitle: ctx?.title ?? null,
        employerId: ctx?.employerId ?? null,
        personId: entry.personId,
        personName: ctx ? `${ctx.firstName} ${ctx.lastName}` : null,
        personEmail: ctx?.email ?? null,
        candidateMatchId: entry.candidateMatchId,
        shortlistedAt: entry.createdAt.toISOString(),
        presentedToEmployerAt: entry.presentedToEmployerAt?.toISOString() ?? null,
        employerFeedback: entry.employerFeedback,
      },
      after: null,
      context: {
        reason: d.reason,
        removedAt: removedAt.toISOString(),
        removedByUserId: session.user.id,
        matchReturnedTo: entry.candidateMatchId ? 'REVIEWED' : null,
      },
    });
    return { ok: true };
  });
}

/** Record the day the shortlisted candidate was presented to the employer. */
export async function recordPresentedToEmployer(input: RecordPresentedInput) {
  const d = parseOrThrow(RecordPresentedSchema, input, 'Invalid presentation');
  const session = await requireMatchingEdit();
  if (d.presentedOn > todayInDublin()) {
    throw new ValidationError('The presentation date cannot be in the future', {
      presentedOn: 'The presentation date cannot be in the future',
    });
  }
  // Stored as 12:00 Irish time on that day (date-level fact, no fake precision).
  const presentedAt = zonedLocalToUtc(`${d.presentedOn}T12:00`, BUSINESS_TIMEZONE);
  if (!presentedAt)
    throw new ValidationError('Enter a valid date', { presentedOn: 'Invalid date' });
  return db.transaction(async (tx) => {
    const before = await lockShortlistEntry(tx, d.shortlistEntryId);
    const [after] = await tx
      .update(shortlistEntries)
      .set({ presentedToEmployerAt: presentedAt, updatedAt: sql`NOW()` })
      .where(eq(shortlistEntries.id, before.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'shortlist_entry',
      entityId: after.id,
      action: 'PRESENTED_TO_EMPLOYER',
      before: { presentedToEmployerAt: before.presentedToEmployerAt?.toISOString() ?? null },
      after: { presentedToEmployerAt: presentedAt.toISOString() },
      context: { jobRequisitionId: after.jobRequisitionId, personId: after.personId },
    });
    return after;
  });
}

/** Record (or update) the employer's feedback. Only after presentation; each change audited. */
export async function recordEmployerFeedback(input: RecordFeedbackInput) {
  const d = parseOrThrow(RecordFeedbackSchema, input, 'Invalid feedback');
  const session = await requireMatchingEdit();
  return db.transaction(async (tx) => {
    const before = await lockShortlistEntry(tx, d.shortlistEntryId);
    if (!before.presentedToEmployerAt) {
      throw new BusinessRuleError(
        'SHORTLIST_NOT_PRESENTED',
        'Record when the candidate was presented to the employer first',
      );
    }
    if (before.employerFeedback === d.feedback) return before;
    const [after] = await tx
      .update(shortlistEntries)
      .set({ employerFeedback: d.feedback, updatedAt: sql`NOW()` })
      .where(eq(shortlistEntries.id, before.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'shortlist_entry',
      entityId: after.id,
      action: 'EMPLOYER_FEEDBACK',
      before: { employerFeedback: before.employerFeedback },
      after: { employerFeedback: after.employerFeedback },
      context: { jobRequisitionId: after.jobRequisitionId, personId: after.personId },
    });
    return after;
  });
}
