import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateQualifications, candidateSkills } from '@/lib/db/schema/candidate_details';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  type CandidateMatch,
  candidateMatches,
  jobRequisitions,
  type MatchReasonSnapshot,
  requisitionQualifications,
  requisitionSkills,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { qualifications, skills } from '@/lib/db/schema/reference';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Deterministic scoring for a person against a requisition.
 *
 * Component weights (all totalled, capped at 100):
 *   - Occupation match (candidate.primary == requisition.occupation)   : +40
 *   - Availability = AVAILABLE                                          : +15
 *   - Lifecycle ACTIVE                                                  : +5
 *   - Preferred location includes requisition location                  : +5
 *   - Required-skills coverage (proportional to matched-required ratio) : up to +25
 *   - Required-qualifications coverage (same shape)                     : up to +10
 *
 * Bucketing:  >= 70 HIGH  |  40–69 MEDIUM  |  0–39 LOW
 */
const WEIGHT_OCCUPATION = 40;
const WEIGHT_AVAILABILITY = 15;
const WEIGHT_LIFECYCLE = 5;
const WEIGHT_LOCATION = 5;
const WEIGHT_SKILLS_MAX = 25;
const WEIGHT_QUALIFICATIONS_MAX = 10;
const MAX_SCORE = 100;

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

type CandidateSnapshot = {
  personId: string;
  primaryOccupationId: string | null;
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  preferredLocation: string | null;
  skillIds: Set<string>;
  qualificationIds: Set<string>;
};

type RequisitionSnapshot = {
  occupationId: string | null;
  location: string | null;
  requiredSkillIds: string[];
  preferredSkillIds: string[];
  skillNamesById: Map<string, string>;
  requiredQualificationIds: string[];
  preferredQualificationIds: string[];
  qualificationNamesById: Map<string, string>;
};

/** Compute score + per-component reason snapshots for a single candidate + requisition. */
export function scoreCandidate(
  candidate: CandidateSnapshot,
  requisition: RequisitionSnapshot,
): { score: number; reasons: MatchReasonSnapshot[] } {
  const reasons: MatchReasonSnapshot[] = [];

  // Occupation
  const occupationMatched =
    !!requisition.occupationId && candidate.primaryOccupationId === requisition.occupationId;
  reasons.push({
    label: 'Occupation match',
    points: occupationMatched ? WEIGHT_OCCUPATION : 0,
    matched: occupationMatched,
    detail: requisition.occupationId ? undefined : 'Requisition has no occupation set',
  });

  // Availability
  const isAvailable = candidate.availabilityStatus === 'AVAILABLE';
  reasons.push({
    label: 'Available',
    points: isAvailable ? WEIGHT_AVAILABILITY : 0,
    matched: isAvailable,
    detail: isAvailable ? undefined : `Currently ${candidate.availabilityStatus.toLowerCase()}`,
  });

  // Lifecycle
  const isActive = candidate.lifecycleStatus === 'ACTIVE';
  reasons.push({
    label: 'Active candidate',
    points: isActive ? WEIGHT_LIFECYCLE : 0,
    matched: isActive,
  });

  // Location
  const reqLocation = requisition.location?.toLowerCase() ?? '';
  const locationMatched =
    !!reqLocation &&
    !!candidate.preferredLocation &&
    candidate.preferredLocation.toLowerCase().includes(reqLocation);
  reasons.push({
    label: 'Location match',
    points: locationMatched ? WEIGHT_LOCATION : 0,
    matched: locationMatched,
    detail: !reqLocation ? 'Requisition has no location' : undefined,
  });

  // Required skills — proportional coverage
  if (requisition.requiredSkillIds.length > 0) {
    const matched = requisition.requiredSkillIds.filter((id) => candidate.skillIds.has(id));
    const points = Math.round(
      (matched.length / requisition.requiredSkillIds.length) * WEIGHT_SKILLS_MAX,
    );
    reasons.push({
      label: 'Required skills',
      points,
      matched: matched.length > 0,
      detail:
        matched.length === 0
          ? 'None of the required skills match'
          : `${matched.length}/${requisition.requiredSkillIds.length}: ${matched
              .map((id) => requisition.skillNamesById.get(id))
              .filter(Boolean)
              .join(', ')}`,
    });
  }

  // Preferred skills — bonus (half the required weight, uncapped)
  if (requisition.preferredSkillIds.length > 0) {
    const matched = requisition.preferredSkillIds.filter((id) => candidate.skillIds.has(id));
    if (matched.length > 0) {
      const points = Math.round(
        (matched.length / requisition.preferredSkillIds.length) * (WEIGHT_SKILLS_MAX / 2),
      );
      reasons.push({
        label: 'Nice-to-have skills',
        points,
        matched: true,
        detail: `${matched.length}/${requisition.preferredSkillIds.length}: ${matched
          .map((id) => requisition.skillNamesById.get(id))
          .filter(Boolean)
          .join(', ')}`,
      });
    }
  }

  // Required qualifications
  if (requisition.requiredQualificationIds.length > 0) {
    const matched = requisition.requiredQualificationIds.filter((id) =>
      candidate.qualificationIds.has(id),
    );
    const points = Math.round(
      (matched.length / requisition.requiredQualificationIds.length) * WEIGHT_QUALIFICATIONS_MAX,
    );
    reasons.push({
      label: 'Required qualifications',
      points,
      matched: matched.length > 0,
      detail:
        matched.length === 0
          ? 'None of the required qualifications match'
          : `${matched.length}/${requisition.requiredQualificationIds.length}: ${matched
              .map((id) => requisition.qualificationNamesById.get(id))
              .filter(Boolean)
              .join(', ')}`,
    });
  }

  // Preferred qualifications
  if (requisition.preferredQualificationIds.length > 0) {
    const matched = requisition.preferredQualificationIds.filter((id) =>
      candidate.qualificationIds.has(id),
    );
    if (matched.length > 0) {
      const points = Math.round(
        (matched.length / requisition.preferredQualificationIds.length) *
          (WEIGHT_QUALIFICATIONS_MAX / 2),
      );
      reasons.push({
        label: 'Nice-to-have qualifications',
        points,
        matched: true,
        detail: `${matched.length}/${requisition.preferredQualificationIds.length}: ${matched
          .map((id) => requisition.qualificationNamesById.get(id))
          .filter(Boolean)
          .join(', ')}`,
      });
    }
  }

  const rawScore = reasons.reduce((sum, r) => sum + r.points, 0);
  const score = Math.min(MAX_SCORE, Math.max(0, rawScore));
  return { score, reasons };
}

/**
 * Run assisted matching for a requisition: score every active-available candidate,
 * upsert matches (existing scores + reasons refreshed, new ones inserted), audit the run.
 */
export async function runAssistedMatching(requisitionId: string): Promise<{ upserted: number }> {
  const session = await requireRole(['ADMIN', 'STAFF']);
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
    .where(isNull(persons.mergedIntoPersonId));

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
