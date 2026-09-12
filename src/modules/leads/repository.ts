import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { type Lead, leads, type NewLead } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import { users } from '@/lib/db/schema/users';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';

export type LeadListRow = {
  id: string;
  status: Lead['status'];
  personId: string;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: Date;
  convertedAt: Date | null;
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

  return db
    .select({
      id: leads.id,
      status: leads.status,
      personId: leads.personId,
      personName: persons.firstName,
      // stitched below
      personEmail: persons.email,
      personPhone: persons.phone,
      assignedUserId: leads.assignedUserId,
      assignedUserName: users.fullName,
      createdAt: leads.createdAt,
      convertedAt: leads.convertedAt,
      lastName: persons.lastName,
    })
    .from(leads)
    .innerJoin(persons, eq(persons.id, leads.personId))
    .leftJoin(users, eq(users.id, leads.assignedUserId))
    .where(and(...whereConds))
    .orderBy(desc(leads.createdAt))
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        personId: r.personId,
        personName: `${r.personName} ${r.lastName}`.trim(),
        personEmail: r.personEmail,
        personPhone: r.personPhone,
        assignedUserId: r.assignedUserId,
        assignedUserName: r.assignedUserName,
        createdAt: r.createdAt,
        convertedAt: r.convertedAt,
      })),
    );
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
