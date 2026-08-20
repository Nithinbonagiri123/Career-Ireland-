import { desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { employers, type JobRequisition, jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type UpdateStatusInput,
  UpdateStatusSchema,
  type UpsertRequisitionInput,
  UpsertRequisitionSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export type RequisitionListRow = JobRequisition & {
  employerName: string;
};

export async function fetchRequisitionsForEmployer(
  employerId: string,
): Promise<RequisitionListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({ requisition: jobRequisitions, employerName: employers.legalName })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(eq(jobRequisitions.employerId, employerId))
    .orderBy(desc(jobRequisitions.createdAt));
  return rows.map((r) => ({ ...r.requisition, employerName: r.employerName }));
}

export async function fetchRequisitions(): Promise<RequisitionListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      requisition: jobRequisitions,
      employerName: employers.legalName,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .orderBy(desc(jobRequisitions.createdAt));
  return rows.map((r) => ({ ...r.requisition, employerName: r.employerName }));
}

export async function fetchRequisition(id: string): Promise<RequisitionListRow | null> {
  await requireRole(['ADMIN', 'STAFF']);
  const [row] = await db
    .select({
      requisition: jobRequisitions,
      employerName: employers.legalName,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(eq(jobRequisitions.id, id))
    .limit(1);
  return row ? { ...row.requisition, employerName: row.employerName } : null;
}

export async function upsertRequisition(input: UpsertRequisitionInput): Promise<JobRequisition> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpsertRequisitionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid requisition',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    employerId: d.employerId,
    primaryContactId: blankToNull(d.primaryContactId) ?? undefined,
    title: d.title,
    occupationId: blankToNull(d.occupationId) ?? undefined,
    positionsRequired: d.positionsRequired,
    location: blankToNull(d.location),
    employmentType: d.employmentType,
    salaryMin: blankToNull(d.salaryMin),
    salaryMax: blankToNull(d.salaryMax),
    salaryCurrencyCode: blankToNull(d.salaryCurrencyCode) ?? undefined,
    description: blankToNull(d.description),
    candidateRequirements: blankToNull(d.candidateRequirements),
    status: d.status,
    assignedUserId: blankToNull(d.assignedUserId) ?? undefined,
    targetFillDate: blankToNull(d.targetFillDate),
  };

  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx
        .select()
        .from(jobRequisitions)
        .where(eq(jobRequisitions.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
      const [after] = await tx
        .update(jobRequisitions)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(jobRequisitions.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_requisition',
        entityId: after.id,
        action: 'UPDATED',
        before: { title: before.title, status: before.status },
        after: { title: after.title, status: after.status },
      });
      return after;
    }
    const [created] = await tx.insert(jobRequisitions).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: created.id,
      action: 'CREATED',
      after: {
        employerId: created.employerId,
        title: created.title,
        positionsRequired: created.positionsRequired,
      },
    });
    return created;
  });
}

export async function updateRequisitionStatus(input: UpdateStatusInput): Promise<JobRequisition> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(jobRequisitions)
      .where(eq(jobRequisitions.id, parsed.requisitionId))
      .limit(1);
    if (!before) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
    if (before.status === parsed.status) return before;
    const [after] = await tx
      .update(jobRequisitions)
      .set({ status: parsed.status, updatedAt: sql`NOW()` })
      .where(eq(jobRequisitions.id, parsed.requisitionId))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_requisition',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  });
}
