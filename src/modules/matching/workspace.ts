import { and, desc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  employers,
  jobRequisitions,
  type MatchReasonSnapshot,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import type { JobCriteria } from './criteria';
import {
  type MatchFilters,
  MatchFiltersSchema,
  type ShortlistFilters,
  ShortlistFiltersSchema,
} from './schemas';

/**
 * R5 — global (cross-job) reads for the Matching and Shortlists
 * workspaces. Need recruitment.matching (view). Each list is capped and
 * filtered on the server.
 */

export const GLOBAL_LIST_LIMIT = 200;

function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const OPEN_JOB = sql`${jobRequisitions.status} NOT IN ('CLOSED','CANCELLED')`;
const confirmedPlaced = sql<boolean>`EXISTS (SELECT 1 FROM placements pl WHERE pl.person_id = ${persons.id} AND pl.status IN ('CONFIRMED','STARTED') AND pl.archived_at IS NULL)`;
const personLive = [
  isNull(persons.archivedAt),
  isNull(persons.mergedIntoPersonId),
  eq(persons.isDraft, false),
];

export type GlobalMatchRow = {
  id: string;
  personId: string;
  personName: string;
  personEmail: string | null;
  requisitionId: string;
  requisitionTitle: string;
  requisitionStatus: string;
  employerId: string;
  employerName: string;
  score: number;
  scoreBucket: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'ASSISTED' | 'MANUAL';
  status: 'SUGGESTED' | 'REVIEWED' | 'DISMISSED' | 'SHORTLISTED';
  reasons: MatchReasonSnapshot[];
  availabilityStatus: string | null;
  confirmedPlaced: boolean;
  updatedAt: Date;
};

function personSearch(q: string): SQL {
  const t = likeTerm(q);
  return or(
    ilike(persons.firstName, t),
    ilike(persons.lastName, t),
    ilike(persons.email, t),
    sql`(${persons.firstName} || ' ' || ${persons.lastName}) ILIKE ${t}`,
  ) as SQL;
}

const unavailable = sql<boolean>`(${confirmedPlaced} OR ${candidateProfiles.availabilityStatus} IN ('PLACED','TEMPORARILY_UNAVAILABLE'))`;

/** Every match filter except `status` (shared by the list and its counts). */
function matchBaseConds(f: MatchFilters): SQL[] {
  const conds: SQL[] = [...personLive];
  if ((f.jobs ?? 'open') === 'open') conds.push(OPEN_JOB);
  if (f.requisitionId) conds.push(eq(candidateMatches.jobRequisitionId, f.requisitionId));
  if (f.bucket) conds.push(eq(candidateMatches.scoreBucket, f.bucket));
  if (f.origin) conds.push(eq(candidateMatches.source, f.origin));
  if (f.q) conds.push(personSearch(f.q));
  return conds;
}

export type MatchCounts = {
  open: number;
  openStrong: number;
  shortlisted: number;
  dismissed: number;
  all: number;
};

/**
 * Stage 6G — counts for the Matching status tabs and KPI tiles, under the
 * same filters as the list (status aside) and the same availability rule.
 */
export async function countGlobalMatches(input: MatchFilters = {}): Promise<MatchCounts> {
  await requirePermission('recruitment', 'matching', 'view');
  const f = MatchFiltersSchema.parse(input);
  const availableOnly = (f.availability ?? 'available') === 'available';
  const [r] = await db
    .select({
      open: sql<number>`COUNT(*) FILTER (WHERE ${candidateMatches.status} IN ('SUGGESTED','REVIEWED'))::int`,
      openStrong: sql<number>`COUNT(*) FILTER (WHERE ${candidateMatches.status} IN ('SUGGESTED','REVIEWED') AND ${candidateMatches.scoreBucket} = 'HIGH')::int`,
      shortlisted: sql<number>`COUNT(*) FILTER (WHERE ${candidateMatches.status} = 'SHORTLISTED')::int`,
      dismissed: sql<number>`COUNT(*) FILTER (WHERE ${candidateMatches.status} = 'DISMISSED')::int`,
      all: sql<number>`COUNT(*)::int`,
    })
    .from(candidateMatches)
    .innerJoin(persons, eq(persons.id, candidateMatches.personId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, candidateMatches.jobRequisitionId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, persons.id))
    .where(
      and(
        ...matchBaseConds(f),
        ...(availableOnly ? [sql`NOT COALESCE(${unavailable}, false)`] : []),
      ),
    );
  return r ?? { open: 0, openStrong: 0, shortlisted: 0, dismissed: 0, all: 0 };
}

export async function fetchGlobalMatches(
  input: MatchFilters = {},
): Promise<{ rows: GlobalMatchRow[]; hiddenUnavailable: number; capped: boolean }> {
  await requirePermission('recruitment', 'matching', 'view');
  const f = MatchFiltersSchema.parse(input);
  const conds: SQL[] = matchBaseConds(f);
  switch (f.status ?? 'open') {
    case 'open':
      conds.push(sql`${candidateMatches.status} IN ('SUGGESTED','REVIEWED')`);
      break;
    case 'shortlisted':
      conds.push(eq(candidateMatches.status, 'SHORTLISTED'));
      break;
    case 'dismissed':
      conds.push(eq(candidateMatches.status, 'DISMISSED'));
      break;
  }
  const availableOnly = (f.availability ?? 'available') === 'available';

  const [hidden] = availableOnly
    ? await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(candidateMatches)
        .innerJoin(persons, eq(persons.id, candidateMatches.personId))
        .innerJoin(jobRequisitions, eq(jobRequisitions.id, candidateMatches.jobRequisitionId))
        .leftJoin(candidateProfiles, eq(candidateProfiles.personId, persons.id))
        .where(and(...conds, sql`COALESCE(${unavailable}, false)`))
    : [{ n: 0 }];

  const rows = await db
    .select({
      m: candidateMatches,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      title: jobRequisitions.title,
      reqStatus: jobRequisitions.status,
      employerId: employers.id,
      employerName: employers.legalName,
      availabilityStatus: candidateProfiles.availabilityStatus,
      confirmedPlaced,
    })
    .from(candidateMatches)
    .innerJoin(persons, eq(persons.id, candidateMatches.personId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, candidateMatches.jobRequisitionId))
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, persons.id))
    .where(and(...conds, ...(availableOnly ? [sql`NOT COALESCE(${unavailable}, false)`] : [])))
    .orderBy(desc(candidateMatches.score), desc(candidateMatches.updatedAt))
    .limit(GLOBAL_LIST_LIMIT + 1);

  return {
    hiddenUnavailable: hidden?.n ?? 0,
    capped: rows.length > GLOBAL_LIST_LIMIT,
    rows: rows.slice(0, GLOBAL_LIST_LIMIT).map((r) => ({
      id: r.m.id,
      personId: r.m.personId,
      personName: `${r.firstName} ${r.lastName}`,
      personEmail: r.email,
      requisitionId: r.m.jobRequisitionId,
      requisitionTitle: r.title,
      requisitionStatus: r.reqStatus,
      employerId: r.employerId,
      employerName: r.employerName,
      score: r.m.score,
      scoreBucket: r.m.scoreBucket,
      source: r.m.source,
      status: r.m.status,
      reasons: r.m.reasons,
      availabilityStatus: r.availabilityStatus,
      confirmedPlaced: Boolean(r.confirmedPlaced),
      updatedAt: r.m.updatedAt,
    })),
  };
}

export type GlobalShortlistRow = {
  id: string;
  personId: string;
  personName: string;
  personEmail: string | null;
  requisitionId: string;
  requisitionTitle: string;
  requisitionStatus: string;
  employerId: string;
  employerName: string;
  score: number | null;
  source: 'ASSISTED' | 'MANUAL' | null;
  shortlistedAt: Date;
  presentedToEmployerAt: Date | null;
  employerFeedback: string | null;
  applicationStatus: string | null;
  updatedAt: Date;
};

/** Every shortlist filter except `presentation` (shared by the list and its counts). */
function shortlistBaseConds(f: ShortlistFilters): SQL[] {
  const conds: SQL[] = [...personLive];
  if ((f.jobs ?? 'open') === 'open') conds.push(OPEN_JOB);
  if (f.requisitionId) conds.push(eq(shortlistEntries.jobRequisitionId, f.requisitionId));
  if (f.q) conds.push(personSearch(f.q));
  return conds;
}

export type ShortlistCounts = {
  all: number;
  notPresented: number;
  awaitingFeedback: number;
  feedback: number;
  applied: number;
};

/** Stage 6G — counts for the Shortlists stage tabs and KPI tiles. */
export async function countGlobalShortlists(
  input: ShortlistFilters = {},
): Promise<ShortlistCounts> {
  await requirePermission('recruitment', 'matching', 'view');
  const f = ShortlistFiltersSchema.parse(input);
  const [r] = await db
    .select({
      all: sql<number>`COUNT(*)::int`,
      notPresented: sql<number>`COUNT(*) FILTER (WHERE ${shortlistEntries.presentedToEmployerAt} IS NULL)::int`,
      awaitingFeedback: sql<number>`COUNT(*) FILTER (WHERE ${shortlistEntries.presentedToEmployerAt} IS NOT NULL AND ${shortlistEntries.employerFeedback} IS NULL)::int`,
      feedback: sql<number>`COUNT(*) FILTER (WHERE ${shortlistEntries.employerFeedback} IS NOT NULL)::int`,
      applied: sql<number>`COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM job_applications ja WHERE ja.job_requisition_id = ${shortlistEntries.jobRequisitionId} AND ja.person_id = ${shortlistEntries.personId}))::int`,
    })
    .from(shortlistEntries)
    .innerJoin(persons, eq(persons.id, shortlistEntries.personId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, shortlistEntries.jobRequisitionId))
    .where(and(...shortlistBaseConds(f)));
  return r ?? { all: 0, notPresented: 0, awaitingFeedback: 0, feedback: 0, applied: 0 };
}

export async function fetchGlobalShortlists(
  input: ShortlistFilters = {},
): Promise<{ rows: GlobalShortlistRow[]; capped: boolean }> {
  await requirePermission('recruitment', 'matching', 'view');
  const f = ShortlistFiltersSchema.parse(input);
  const conds: SQL[] = shortlistBaseConds(f);
  switch (f.presentation ?? 'all') {
    case 'not_presented':
      conds.push(isNull(shortlistEntries.presentedToEmployerAt));
      break;
    case 'awaiting_feedback':
      conds.push(
        sql`${shortlistEntries.presentedToEmployerAt} IS NOT NULL AND ${shortlistEntries.employerFeedback} IS NULL`,
      );
      break;
    case 'feedback':
      conds.push(sql`${shortlistEntries.employerFeedback} IS NOT NULL`);
      break;
  }
  const rows = await db
    .select({
      s: shortlistEntries,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      title: jobRequisitions.title,
      reqStatus: jobRequisitions.status,
      employerId: employers.id,
      employerName: employers.legalName,
      score: candidateMatches.score,
      source: candidateMatches.source,
      applicationStatus: sql<
        string | null
      >`(SELECT ja.status FROM job_applications ja WHERE ja.job_requisition_id = ${shortlistEntries.jobRequisitionId} AND ja.person_id = ${shortlistEntries.personId} LIMIT 1)`,
    })
    .from(shortlistEntries)
    .innerJoin(persons, eq(persons.id, shortlistEntries.personId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, shortlistEntries.jobRequisitionId))
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .leftJoin(candidateMatches, eq(candidateMatches.id, shortlistEntries.candidateMatchId))
    .where(and(...conds))
    .orderBy(desc(shortlistEntries.createdAt))
    .limit(GLOBAL_LIST_LIMIT + 1);
  return {
    capped: rows.length > GLOBAL_LIST_LIMIT,
    rows: rows.slice(0, GLOBAL_LIST_LIMIT).map((r) => ({
      id: r.s.id,
      personId: r.s.personId,
      personName: `${r.firstName} ${r.lastName}`,
      personEmail: r.email,
      requisitionId: r.s.jobRequisitionId,
      requisitionTitle: r.title,
      requisitionStatus: r.reqStatus,
      employerId: r.employerId,
      employerName: r.employerName,
      score: r.score,
      source: r.source,
      shortlistedAt: r.s.createdAt,
      presentedToEmployerAt: r.s.presentedToEmployerAt,
      employerFeedback: r.s.employerFeedback,
      applicationStatus: r.applicationStatus,
      updatedAt: r.s.updatedAt,
    })),
  };
}

export type ShortlistRemovalRow = {
  id: string;
  removedAt: Date;
  removedByName: string | null;
  reason: string | null;
  personId: string | null;
  personName: string | null;
  requisitionId: string | null;
  requisitionTitle: string | null;
  shortlistedAt: string | null;
  presentedToEmployerAt: string | null;
  employerFeedback: string | null;
  /** Older removals (before R5) recorded only job + person. */
  legacy: boolean;
};

/** Removal history from the immutable audit snapshots (newest first). */
export async function fetchShortlistRemovals(
  opts: { requisitionId?: string; q?: string } = {},
): Promise<ShortlistRemovalRow[]> {
  await requirePermission('recruitment', 'matching', 'view');
  const conds: SQL[] = [
    sql`e.entity_type = 'shortlist_entry'`,
    sql`e.action IN ('REMOVED','DELETED')`,
  ];
  if (opts.requisitionId) conds.push(sql`e.before->>'jobRequisitionId' = ${opts.requisitionId}`);
  if (opts.q)
    conds.push(
      sql`COALESCE(e.before->>'personName', p.first_name || ' ' || p.last_name) ILIKE ${likeTerm(opts.q)}`,
    );
  const rows = await db.execute<{
    id: string;
    occurred_at: Date | string;
    actor_name: string | null;
    action: string;
    before: Record<string, unknown> | null;
    context: Record<string, unknown> | null;
    person_name: string | null;
    req_title: string | null;
  }>(sql`
    SELECT e.id, e.occurred_at, u.full_name AS actor_name, e.action, e.before, e.context,
           p.first_name || ' ' || p.last_name AS person_name, r.title AS req_title
    FROM audit_events e
    LEFT JOIN users u ON u.id = e.actor_user_id
    LEFT JOIN persons p ON p.id::text = e.before->>'personId'
    LEFT JOIN job_requisitions r ON r.id::text = e.before->>'jobRequisitionId'
    WHERE ${sql.join(conds, sql` AND `)}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ${GLOBAL_LIST_LIMIT}
  `);
  return rows.map((r) => {
    const b = r.before ?? {};
    const c = r.context ?? {};
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      id: r.id,
      removedAt: new Date(r.occurred_at),
      removedByName: r.actor_name,
      reason: str(c.reason),
      personId: str(b.personId),
      personName: str(b.personName) ?? r.person_name,
      requisitionId: str(b.jobRequisitionId),
      requisitionTitle: str(b.requisitionTitle) ?? r.req_title,
      shortlistedAt: str(b.shortlistedAt),
      presentedToEmployerAt: str(b.presentedToEmployerAt),
      employerFeedback: str(b.employerFeedback),
      legacy: r.action !== 'REMOVED',
    };
  });
}

/** Jobs for the workspace filters: open jobs first, with their employer. */
export type MatchingJobOption = {
  id: string;
  title: string;
  employerName: string;
  open: boolean;
  /** What the job's criteria let a candidate score (for the minimum-score warning). */
  criteria: JobCriteria;
};

export async function fetchMatchingJobOptions(): Promise<MatchingJobOption[]> {
  await requirePermission('recruitment', 'matching', 'view');
  const rows = await db
    .select({
      id: jobRequisitions.id,
      title: jobRequisitions.title,
      employerName: employers.legalName,
      status: jobRequisitions.status,
      occupationId: jobRequisitions.occupationId,
      location: jobRequisitions.location,
      reqSkills: sql<number>`(SELECT COUNT(*)::int FROM requisition_skills rs WHERE rs.job_requisition_id = ${jobRequisitions.id} AND rs.is_required)`,
      prefSkills: sql<number>`(SELECT COUNT(*)::int FROM requisition_skills rs WHERE rs.job_requisition_id = ${jobRequisitions.id} AND NOT rs.is_required)`,
      reqQuals: sql<number>`(SELECT COUNT(*)::int FROM requisition_qualifications rq WHERE rq.job_requisition_id = ${jobRequisitions.id} AND rq.is_required)`,
      prefQuals: sql<number>`(SELECT COUNT(*)::int FROM requisition_qualifications rq WHERE rq.job_requisition_id = ${jobRequisitions.id} AND NOT rq.is_required)`,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .orderBy(sql`${jobRequisitions.status} IN ('CLOSED','CANCELLED')`, jobRequisitions.title)
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    employerName: r.employerName,
    open: r.status !== 'CLOSED' && r.status !== 'CANCELLED',
    criteria: {
      hasOccupation: Boolean(r.occupationId),
      hasLocation: Boolean(r.location?.trim()),
      requiredSkills: r.reqSkills,
      preferredSkills: r.prefSkills,
      requiredQualifications: r.reqQuals,
      preferredQualifications: r.prefQuals,
    },
  }));
}
