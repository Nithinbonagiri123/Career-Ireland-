import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { type Lead, leads, type NewLead } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';

export type LeadListRow = {
  id: string;
  status: Lead['status'];
  targetBusiness: Lead['targetBusiness'];
  /** Person payer — null for RECRUITMENT leads (see employerId instead). */
  personId: string | null;
  /** Employer payer — null for CANDIDATE_SERVICES / IMMIGRATION leads. */
  employerId: string | null;
  /** Person's full name — null for RECRUITMENT leads. Kept for back-compat
      with existing UI paths that were built when every lead was person-based. */
  personName: string | null;
  /** Employer's legal name — null for CANDIDATE_SERVICES / IMMIGRATION. */
  employerName: string | null;
  /** Person-or-employer display name, guaranteed non-null. Use this in new UI. */
  displayName: string;
  personEmail: string | null;
  personPhone: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: Date;
  convertedAt: Date | null;
  /** True if any payment (across any engagement for this person) is
      VERIFIED. Drives the "ready to convert" affordance on the row. */
  hasVerifiedPayment: boolean;
};

export async function listLeads(opts?: {
  scope?: AssignmentScope;
  currentUserId?: string;
  createdRange?: DateRange;
}): Promise<LeadListRow[]> {
  const scopeCond =
    opts?.scope && opts.currentUserId
      ? assignmentCondition(opts.scope, leads.assignedUserId, opts.currentUserId)
      : undefined;
  const createdCond = opts?.createdRange
    ? dateRangeWhere(leads.createdAt, opts.createdRange)
    : undefined;

  const whereConds: SQL[] = [isNull(leads.archivedAt)];
  if (scopeCond) whereConds.push(scopeCond);
  if (createdCond) whereConds.push(createdCond);

  // Left-join both persons and employers so recruitment leads (employer-payer)
  // and CS/immigration leads (person-payer) both appear. The check constraint
  // in leads.ts guarantees exactly one side is set per row.
  const rows = await db
    .select({
      id: leads.id,
      status: leads.status,
      targetBusiness: leads.targetBusiness,
      personId: leads.personId,
      employerId: leads.employerId,
      personName: persons.firstName,
      lastName: persons.lastName,
      personEmail: persons.email,
      personPhone: persons.phone,
      employerName: employers.legalName,
      assignedUserId: leads.assignedUserId,
      assignedUserName: users.fullName,
      createdAt: leads.createdAt,
      convertedAt: leads.convertedAt,
    })
    .from(leads)
    .leftJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(employers, eq(employers.id, leads.employerId))
    .leftJoin(users, eq(users.id, leads.assignedUserId))
    .where(and(...whereConds))
    .orderBy(desc(leads.createdAt));

  // Second round-trip: which of these persons has at least one
  // VERIFIED payment? One `IN (…)` query for the whole page — cheaper
  // than N per-row lookups. Returns an empty set when there are no
  // rows to check (skips the trip entirely).
  const personIds = rows.map((r) => r.personId).filter((id): id is string => id !== null);
  let personsWithVerifiedPayment = new Set<string>();
  if (personIds.length > 0) {
    const paidRows = await db
      .selectDistinct({ personId: serviceEngagements.payerPersonId })
      .from(payments)
      .innerJoin(serviceEngagements, eq(serviceEngagements.id, payments.serviceEngagementId))
      .where(
        and(eq(payments.status, 'VERIFIED'), inArray(serviceEngagements.payerPersonId, personIds)),
      );
    personsWithVerifiedPayment = new Set(
      paidRows.map((r) => r.personId).filter((id): id is string => id !== null),
    );
  }

  return rows.map((r) => {
    const personFullName =
      r.personId && r.personName ? `${r.personName} ${r.lastName ?? ''}`.trim() : null;
    const displayName = personFullName ?? r.employerName ?? '(unknown)';
    return {
      id: r.id,
      status: r.status,
      targetBusiness: r.targetBusiness,
      personId: r.personId,
      employerId: r.employerId,
      personName: personFullName,
      employerName: r.employerName,
      displayName,
      personEmail: r.personEmail,
      personPhone: r.personPhone,
      assignedUserId: r.assignedUserId,
      assignedUserName: r.assignedUserName,
      createdAt: r.createdAt,
      convertedAt: r.convertedAt,
      hasVerifiedPayment: r.personId ? personsWithVerifiedPayment.has(r.personId) : false,
    };
  });
}

export async function getLead(id: string): Promise<Lead | null> {
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return row ?? null;
}

export async function insertLead(tx: DbExecutor, data: NewLead): Promise<Lead> {
  const [row] = await tx.insert(leads).values(data).returning();
  if (!row) throw new Error('leads insert returned no row');
  return row;
}

export async function updateLead(
  tx: DbExecutor,
  id: string,
  patch: Partial<
    Pick<Lead, 'status' | 'notes' | 'convertedAt' | 'convertedByUserId' | 'conversionMethod'>
  >,
): Promise<Lead> {
  const [row] = await tx.update(leads).set(patch).where(eq(leads.id, id)).returning();
  if (!row) throw new Error(`lead ${id} not found`);
  return row;
}
