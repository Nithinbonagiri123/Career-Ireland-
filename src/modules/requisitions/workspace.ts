import { and, desc, eq, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { interviews, offers } from '@/lib/db/schema/interviews_offers';
import { persons } from '@/lib/db/schema/persons';
import { jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';
import { NotFoundError } from '@/lib/errors';

/**
 * R2 — read-only queries for the Job Requirements workspace. Same access
 * rule as the requisition page itself (`fetchRequisition`: internal
 * staff), and every query is scoped to ONE requisition id.
 */

async function assertRequisitionExists(requisitionId: string): Promise<void> {
  const [row] = await db
    .select({ id: jobRequisitions.id })
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .limit(1);
  if (!row) throw new NotFoundError('Requisition');
}

/* ─── Activity ─────────────────────────────────────────────────────── */

export type RequisitionActivityRow = {
  id: string;
  occurredAt: Date;
  actorName: string | null;
  entityType: string;
  action: string;
  summary: string;
};

export const ACTIVITY_PAGE_SIZE = 25;

const ENTITY_LABEL: Record<string, string> = {
  job_requisition: 'Job',
  requisition_skill: 'Required skill',
  requisition_qualification: 'Required qualification',
  job_application: 'Application',
  placement: 'Placement',
  candidate_match: 'Match',
  shortlist_entry: 'Shortlist',
  work_permit_checklist: 'Checklist',
  task: 'Work log',
  communication_log: 'Communication',
  invoice: 'Invoice',
};

function describe(entityType: string, action: string, before: unknown, after: unknown): string {
  const label = ENTITY_LABEL[entityType] ?? entityType.replace(/_/g, ' ');
  const verb = action.replace(/_/g, ' ').toLowerCase();
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const from = typeof b.status === 'string' ? b.status : null;
  const to = typeof a.status === 'string' ? a.status : null;
  if (from && to && from !== to) {
    return `${label} ${verb}: ${from.replace(/_/g, ' ')} → ${to.replace(/_/g, ' ')}`;
  }
  return `${label} ${verb}`;
}

/**
 * Audit trail for one requisition and the records that belong to it:
 * the job row (incl. its skill / qualification edits, which audit
 * against the requisition id), its applications, placements, matches,
 * shortlist entries, checklists, work-log tasks, communications and
 * invoices. Newest first, paginated (page is 1-based).
 */
export async function fetchRequisitionActivity(
  requisitionId: string,
  opts?: { page?: number; pageSize?: number },
): Promise<{ rows: RequisitionActivityRow[]; page: number; hasMore: boolean }> {
  await requireInternalStaff();
  await assertRequisitionExists(requisitionId);
  const pageSize = Math.min(Math.max(opts?.pageSize ?? ACTIVITY_PAGE_SIZE, 1), 100);
  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const offset = (page - 1) * pageSize;

  const rid = requisitionId;
  const rows = await db.execute<{
    id: string;
    occurred_at: Date | string;
    actor_name: string | null;
    entity_type: string;
    action: string;
    before: unknown;
    after: unknown;
  }>(sql`
    SELECT a.id, a.occurred_at, u.full_name AS actor_name, a.entity_type, a.action, a.before, a.after
    FROM audit_events a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE
      (a.entity_type IN ('job_requisition','requisition_skill','requisition_qualification') AND a.entity_id = ${rid}::text)
      OR (a.entity_type = 'job_application' AND a.entity_id IN (SELECT id::text FROM job_applications WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'placement' AND a.entity_id IN (SELECT id::text FROM placements WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'candidate_match' AND a.entity_id IN (SELECT id::text FROM candidate_matches WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'shortlist_entry' AND a.entity_id IN (SELECT id::text FROM shortlist_entries WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'work_permit_checklist' AND a.entity_id IN (SELECT id::text FROM work_permit_checklists WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'task' AND a.entity_id IN (SELECT id::text FROM tasks WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'communication_log' AND a.entity_id IN (SELECT id::text FROM communication_logs WHERE job_requisition_id = ${rid}))
      OR (a.entity_type = 'invoice' AND a.entity_id IN (SELECT id::text FROM invoices WHERE job_requisition_id = ${rid}))
    ORDER BY a.occurred_at DESC, a.id DESC
    LIMIT ${pageSize + 1} OFFSET ${offset}
  `);

  const hasMore = rows.length > pageSize;
  return {
    page,
    hasMore,
    rows: rows.slice(0, pageSize).map((r) => ({
      id: r.id,
      occurredAt: new Date(r.occurred_at),
      actorName: r.actor_name,
      entityType: r.entity_type,
      action: r.action,
      summary: describe(r.entity_type, r.action, r.before, r.after),
    })),
  };
}

/* ─── Interviews & offers (read-only) ──────────────────────────────── */

export type RequisitionInterviewRow = {
  id: string;
  personId: string;
  personName: string;
  scheduledAt: Date;
  durationMinutes: number | null;
  mode: string;
  round: number;
  location: string | null;
  status: string;
  outcome: string | null;
  scheduledByName: string | null;
};

export type RequisitionOfferRow = {
  id: string;
  personId: string;
  personName: string;
  amount: string;
  currencyCode: string;
  period: string;
  startDate: string | null;
  expiresOn: string | null;
  sentAt: Date | null;
  respondedAt: Date | null;
  status: string;
  createdAt: Date;
};

/**
 * Interviews and offers recorded against this requisition's applications.
 * Read-only by design (R2): nothing here schedules, edits or sends.
 */
export async function listInterviewsAndOffersForRequisition(requisitionId: string): Promise<{
  interviews: RequisitionInterviewRow[];
  offers: RequisitionOfferRow[];
}> {
  await requireInternalStaff();
  await assertRequisitionExists(requisitionId);

  const interviewRows = await db
    .select({
      id: interviews.id,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      scheduledAt: interviews.scheduledAt,
      durationMinutes: interviews.durationMinutes,
      mode: interviews.mode,
      round: interviews.round,
      location: interviews.location,
      status: interviews.status,
      outcome: interviews.outcome,
      scheduledByName: users.fullName,
    })
    .from(interviews)
    .innerJoin(jobApplications, eq(jobApplications.id, interviews.jobApplicationId))
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .leftJoin(users, eq(users.id, interviews.scheduledByUserId))
    .where(and(eq(jobApplications.jobRequisitionId, requisitionId)))
    .orderBy(desc(interviews.scheduledAt));

  const offerRows = await db
    .select({
      id: offers.id,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      amount: offers.amount,
      currencyCode: offers.currencyCode,
      period: offers.period,
      startDate: offers.startDate,
      expiresOn: offers.expiresOn,
      sentAt: offers.sentAt,
      respondedAt: offers.respondedAt,
      status: offers.status,
      createdAt: offers.createdAt,
    })
    .from(offers)
    .innerJoin(jobApplications, eq(jobApplications.id, offers.jobApplicationId))
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .where(eq(jobApplications.jobRequisitionId, requisitionId))
    .orderBy(desc(offers.createdAt));

  return {
    interviews: interviewRows.map(({ firstName, lastName, ...r }) => ({
      ...r,
      personName: `${firstName} ${lastName}`,
    })),
    offers: offerRows.map(({ firstName, lastName, ...r }) => ({
      ...r,
      personName: `${firstName} ${lastName}`,
    })),
  };
}
