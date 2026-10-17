import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
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
   *  when the person has no cases — do not infer status from country or
   *  nationality. The label prefers the application-type name
   *  ("Stamp 4", "Critical Skills Work Permit") and falls back to the
   *  case_type enum when the catalog row is missing (legacy cases). */
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
  /** Live counts for the card's ring counters. Zero when the person has
   *  no rows in that table — the card renders zero as a quiet 0, not a
   *  placeholder, since zero IS the fact. */
  applicationsCount: number;
  shortlistsCount: number;
  placementsCount: number;
};

export async function listCandidates(opts?: {
  scope?: AssignmentScope;
  currentUserId?: string;
  createdRange?: DateRange;
}): Promise<CandidateListRow[]> {
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

  const rows = await db
    .select({
      candidateProfileId: candidateProfiles.id,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
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
    const immRows = await db.execute<{
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
    const appRows = await db.execute<{ person_id: string; n: string }>(sql`
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
    const slRows = await db.execute<{ person_id: string; n: string }>(sql`
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
    const plRows = await db.execute<{ person_id: string; n: string }>(sql`
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

  // Reference inArray to silence lint when no scope path used it.
  void inArray;

  return rows.map((r) => {
    const imm = immigrationByPerson.get(r.personId);
    return {
      candidateProfileId: r.candidateProfileId,
      personId: r.personId,
      fullName: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      phone: r.phone,
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
      applicationsCount: applicationsByPerson.get(r.personId) ?? 0,
      shortlistsCount: shortlistsByPerson.get(r.personId) ?? 0,
      placementsCount: placementsByPerson.get(r.personId) ?? 0,
    };
  });
}
