import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { occupations } from '@/lib/db/schema/occupations';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { users } from '@/lib/db/schema/users';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';

export type CandidateListRow = {
  candidateProfileId: string;
  personId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** Person-level nationality text ("South African") — the card renders
   *  it with its flag emoji per the approved Screen 03 mockup. */
  nationality: string | null;
  currentCity: string | null;
  currentCountry: string | null;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED';
  activatedAt: Date;
  createdAt: Date;
  assignedUserId: string | null;
  assignedUserName: string | null;
  /** Primary profession (identity-level) — null when unset so the card
   *  renders a neutral placeholder rather than guessing. Looked up via
   *  persons.primary_occupation_id → occupations.name; candidate_profiles
   *  is kept in sync at conversion time (Stage 4). */
  primaryOccupationName: string | null;
  /** Most-recent non-archived immigration case for this person. NULL
   *  when the person has no cases — never inferred from country or
   *  nationality. The label is the application-type name
   *  ("Stamp 4", "Critical Skills Work Permit"); when the catalog
   *  row is missing (legacy cases) it falls back to the case_type
   *  enum ("EMPLOYMENT_PERMIT", "VISA", "VISA_EXTENSION"). */
  immigrationPermitLabel: string | null;
  immigrationStatus:
    | 'OPEN'
    | 'DOCUMENTS_PENDING'
    | 'SUBMITTED'
    | 'UNDER_AUTHORITY_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'CLOSED'
    | null;
  immigrationExpiresOn: Date | null;
  /**
   * Stage 6E+1 — operator-declared Irish immigration status captured on
   * the CS lead form (STAMP_4, PENDING, …). Lives on persons, separate
   * from the immigration-case data above so a current permission is
   * never confused with an application/case. Null when nothing was
   * captured (pre-6E+1 persons, non-CS leads).
   */
  irishImmigrationStatus:
    | 'NONE'
    | 'STAMP_1'
    | 'STAMP_1G'
    | 'STAMP_2'
    | 'STAMP_3'
    | 'STAMP_4'
    | 'OTHER'
    | 'PENDING'
    | 'NOT_PROVIDED'
    | null;
  /**
   * Classification of the immigration record for display, derived from
   * (status, expiresOn):
   *   - CURRENT_PERMISSION  — status = APPROVED AND (expiresOn is NULL
   *                            OR expiresOn > today)
   *   - EXPIRED_PERMISSION  — status = APPROVED AND expiresOn <= today
   *   - PENDING_CASE        — status in (OPEN, DOCUMENTS_PENDING,
   *                            SUBMITTED, UNDER_AUTHORITY_REVIEW)
   *   - REJECTED_CASE       — status = REJECTED
   *   - CLOSED_CASE         — status = CLOSED
   *   - NONE                — no case on file
   * The card renders a different headline per kind so a pending or
   * rejected application is never presented as a currently-held
   * permission. For any non-APPROVED status the card uses the
   * neutral "Immigration case" label with the status pill alongside.
   */
  immigrationKind:
    | 'CURRENT_PERMISSION'
    | 'EXPIRED_PERMISSION'
    | 'PENDING_CASE'
    | 'REJECTED_CASE'
    | 'CLOSED_CASE'
    | 'NONE';
  /**
   * Stage B Wave 3 — derived Candidate Services progress status. Only
   * meaningful for an ACTIVE lifecycle (null otherwise). Derived from
   * real records, never stored:
   *   PLACED           — availabilityStatus is PLACED (written only by
   *                      Recruitment placements; mirrored read-only here)
   *   IN_PROGRESS      — ≥1 non-archived engagement ACTIVE /
   *                      PENDING_PAYMENT / ON_HOLD
   *   COMPLETED        — no live engagement, ≥1 COMPLETED
   *   ACTIVE_CANDIDATE — activated, no engagement signal
   * Same precedence as derivePrimaryOnboardingStatus in
   * clients/onboarding-status.ts — keep the two in lockstep.
   */
  csProgressStatus: 'PLACED' | 'IN_PROGRESS' | 'COMPLETED' | 'ACTIVE_CANDIDATE' | null;
  /** Live counts for the card's ring counters. Zero when the person has
   *  no rows in that table — the card renders zero as a quiet 0, not a
   *  placeholder, since zero IS the fact. */
  applicationsCount: number;
  shortlistsCount: number;
  placementsCount: number;
};

/**
 * Query cost — one page of N candidates issues exactly 6 round-trips
 * independent of N:
 *   (1) main SELECT with 3 joins (persons / users / occupations)
 *   (2) one IN() lookup against immigration_cases
 *   (3) one IN() grouped lookup against job_applications
 *   (4) one IN() grouped lookup against shortlist_entries
 *   (5) one IN() grouped lookup against placements
 *   (6) one IN() grouped lookup against service_engagements (Wave 3
 *       progress flags)
 * If this ever regresses to N+1 the perf regression test in
 * repository.test.ts will time out on 100 seeded candidates.
 *
 * `executor` is optional so the regression test can hand in a
 * counting proxy; production callers default to the shared `db`.
 */
export async function listCandidates(opts?: {
  scope?: AssignmentScope;
  currentUserId?: string;
  createdRange?: DateRange;
  executor?: DbExecutor;
}): Promise<CandidateListRow[]> {
  const exec = opts?.executor ?? db;
  const scopeCond =
    opts?.scope && opts.currentUserId
      ? assignmentCondition(opts.scope, candidateProfiles.assignedUserId, opts.currentUserId)
      : undefined;
  const createdCond = opts?.createdRange
    ? dateRangeWhere(candidateProfiles.createdAt, opts.createdRange)
    : undefined;

  const whereConds: SQL[] = [
    eq(persons.isDraft, false),
    isNull(persons.mergedIntoPersonId),
    isNull(persons.archivedAt),
  ];
  if (scopeCond) whereConds.push(scopeCond);
  if (createdCond) whereConds.push(createdCond);

  const rows = await exec
    .select({
      candidateProfileId: candidateProfiles.id,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      nationality: persons.nationality,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
      irishImmigrationStatus: persons.irishImmigrationStatus,
      primaryOccupationName: occupations.name,
      lifecycleStatus: candidateProfiles.lifecycleStatus,
      availabilityStatus: candidateProfiles.availabilityStatus,
      activatedAt: candidateProfiles.activatedAt,
      createdAt: candidateProfiles.createdAt,
      assignedUserId: candidateProfiles.assignedUserId,
      assignedUserName: users.fullName,
    })
    .from(candidateProfiles)
    .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
    .leftJoin(users, eq(users.id, candidateProfiles.assignedUserId))
    .leftJoin(occupations, eq(occupations.id, persons.primaryOccupationId))
    // Filter draft, merged, and archived persons out of every active list —
    // CSV exports, dashboards, matching feeds, search: everything downstream
    // reads this and none of them should see half-filled onboarding drafts.
    .where(and(...whereConds))
    .orderBy(desc(candidateProfiles.activatedAt));

  const personIds = rows.map((r) => r.personId);

  // Immigration: most-recent non-archived case per person. SQL does the
  // reduction — one round trip. Falls back from applicationTypeId name
  // to case_type enum when the catalog row is missing.
  const immigrationByPerson = new Map<
    string,
    {
      label: string;
      status: CandidateListRow['immigrationStatus'];
      expiresOn: Date | null;
    }
  >();
  if (personIds.length > 0) {
    const immRows = await exec.execute<{
      beneficiary_person_id: string;
      permit_label: string;
      status: string;
      expires_on: string | null;
    }>(sql`
      SELECT DISTINCT ON (c.beneficiary_person_id)
        c.beneficiary_person_id,
        COALESCE(t.name, c.case_type) AS permit_label,
        c.status::text AS status,
        c.expires_on
      FROM immigration_cases c
      LEFT JOIN immigration_application_types t ON t.id = c.application_type_id
      WHERE c.archived_at IS NULL
        AND c.beneficiary_person_id IN (${sql.join(
          personIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      ORDER BY c.beneficiary_person_id, c.updated_at DESC
    `);
    for (const r of immRows as Array<{
      beneficiary_person_id: string;
      permit_label: string;
      status: string;
      expires_on: string | null;
    }>) {
      immigrationByPerson.set(r.beneficiary_person_id, {
        label: r.permit_label,
        status: r.status as CandidateListRow['immigrationStatus'],
        expiresOn: r.expires_on ? new Date(r.expires_on) : null,
      });
    }
  }

  // Counts for apps / shortlists / placements — one query each, same
  // IN-list. Cheap on index + much simpler than a stitched CTE.
  const applicationsByPerson = new Map<string, number>();
  const shortlistsByPerson = new Map<string, number>();
  const placementsByPerson = new Map<string, number>();
  if (personIds.length > 0) {
    const appRows = await exec.execute<{ person_id: string; n: string }>(sql`
      SELECT person_id, COUNT(*)::text AS n FROM job_applications
      WHERE person_id IN (${sql.join(
        personIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      GROUP BY person_id
    `);
    for (const r of appRows as Array<{ person_id: string; n: string }>) {
      applicationsByPerson.set(r.person_id, Number(r.n));
    }
    const slRows = await exec.execute<{ person_id: string; n: string }>(sql`
      SELECT person_id, COUNT(*)::text AS n FROM shortlist_entries
      WHERE person_id IN (${sql.join(
        personIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      GROUP BY person_id
    `);
    for (const r of slRows as Array<{ person_id: string; n: string }>) {
      shortlistsByPerson.set(r.person_id, Number(r.n));
    }
    const plRows = await exec.execute<{ person_id: string; n: string }>(sql`
      SELECT person_id, COUNT(*)::text AS n FROM placements
      WHERE person_id IN (${sql.join(
        personIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      GROUP BY person_id
    `);
    for (const r of plRows as Array<{ person_id: string; n: string }>) {
      placementsByPerson.set(r.person_id, Number(r.n));
    }
  }

  // Stage B Wave 3 — engagement progress flags, one grouped round trip.
  // A person can sit on an engagement as payer OR beneficiary (same rule
  // as the client workspace); archived engagements don't count towards
  // progress. BOOL_OR collapses duplicates when payer = beneficiary.
  const engagementFlagsByPerson = new Map<string, { live: boolean; completed: boolean }>();
  if (personIds.length > 0) {
    const inList = sql.join(
      personIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const engRows = await exec.execute<{ person_id: string; live: boolean; completed: boolean }>(
      sql`
      SELECT person_id,
             BOOL_OR(status IN ('ACTIVE', 'PENDING_PAYMENT', 'ON_HOLD')) AS live,
             BOOL_OR(status = 'COMPLETED') AS completed
      FROM (
        SELECT payer_person_id AS person_id, status FROM service_engagements
        WHERE archived_at IS NULL AND payer_person_id IN (${inList})
        UNION ALL
        SELECT beneficiary_person_id, status FROM service_engagements
        WHERE archived_at IS NULL AND beneficiary_person_id IN (${inList})
      ) s
      GROUP BY person_id
    `,
    );
    for (const r of engRows as Array<{ person_id: string; live: boolean; completed: boolean }>) {
      engagementFlagsByPerson.set(r.person_id, { live: r.live, completed: r.completed });
    }
  }

  // Reference inArray to silence lint when no scope path used it.
  void inArray;

  // Today, computed once at request time. Used to classify APPROVED
  // cases with a non-null expires_on as current vs expired.
  const todayStr = new Date().toISOString().slice(0, 10);

  return rows.map((r) => {
    const imm = immigrationByPerson.get(r.personId);
    const immigrationKind = classifyImmigration(imm, todayStr);
    const eng = engagementFlagsByPerson.get(r.personId);
    const csProgressStatus: CandidateListRow['csProgressStatus'] =
      r.lifecycleStatus !== 'ACTIVE'
        ? null
        : r.availabilityStatus === 'PLACED'
          ? 'PLACED'
          : eng?.live
            ? 'IN_PROGRESS'
            : eng?.completed
              ? 'COMPLETED'
              : 'ACTIVE_CANDIDATE';
    return {
      candidateProfileId: r.candidateProfileId,
      personId: r.personId,
      fullName: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      phone: r.phone,
      nationality: r.nationality,
      currentCity: r.currentCity,
      currentCountry: r.currentCountry,
      primaryOccupationName: r.primaryOccupationName ?? null,
      lifecycleStatus: r.lifecycleStatus,
      availabilityStatus: r.availabilityStatus,
      activatedAt: r.activatedAt,
      createdAt: r.createdAt,
      assignedUserId: r.assignedUserId,
      assignedUserName: r.assignedUserName,
      immigrationPermitLabel: imm?.label ?? null,
      immigrationStatus: imm?.status ?? null,
      immigrationExpiresOn: imm?.expiresOn ?? null,
      irishImmigrationStatus: r.irishImmigrationStatus,
      immigrationKind,
      csProgressStatus,
      applicationsCount: applicationsByPerson.get(r.personId) ?? 0,
      shortlistsCount: shortlistsByPerson.get(r.personId) ?? 0,
      placementsCount: placementsByPerson.get(r.personId) ?? 0,
    };
  });
}

/**
 * Pure classifier — exported so unit tests can lock the matrix without
 * seeding immigration rows. Operates on the shape stored in the
 * immigrationByPerson map inside listCandidates.
 */
export function classifyImmigration(
  imm:
    | {
        status: CandidateListRow['immigrationStatus'];
        expiresOn: Date | null;
      }
    | undefined
    | null,
  todayStr: string,
): CandidateListRow['immigrationKind'] {
  if (!imm?.status) return 'NONE';
  switch (imm.status) {
    case 'APPROVED': {
      if (!imm.expiresOn) return 'CURRENT_PERMISSION';
      const expiryStr = imm.expiresOn.toISOString().slice(0, 10);
      return expiryStr > todayStr ? 'CURRENT_PERMISSION' : 'EXPIRED_PERMISSION';
    }
    case 'OPEN':
    case 'DOCUMENTS_PENDING':
    case 'SUBMITTED':
    case 'UNDER_AUTHORITY_REVIEW':
      return 'PENDING_CASE';
    case 'REJECTED':
      return 'REJECTED_CASE';
    case 'CLOSED':
      return 'CLOSED_CASE';
    default:
      return 'NONE';
  }
}
