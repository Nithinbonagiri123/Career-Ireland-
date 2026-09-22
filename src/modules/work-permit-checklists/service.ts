import { and, desc, eq } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { jobRequisitions } from '@/lib/db/schema/recruitment';
import {
  type WorkPermitChecklist,
  workPermitChecklists,
} from '@/lib/db/schema/work_permit_checklists';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { type UpsertWorkPermitChecklistInput, UpsertWorkPermitChecklistSchema } from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export type WorkPermitChecklistRow = WorkPermitChecklist & {
  personName: string;
};

/**
 * List every checklist attached to a requisition, joined to the person's
 * name so the requisition-side table can render "Priya Sharma · updated
 * 3 minutes ago". Ordered by updatedAt DESC so the most recently-touched
 * row sits at the top.
 */
export async function listChecklistsForRequisition(
  jobRequisitionId: string,
): Promise<WorkPermitChecklistRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({
      checklist: workPermitChecklists,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(workPermitChecklists)
    .innerJoin(persons, eq(persons.id, workPermitChecklists.personId))
    .where(eq(workPermitChecklists.jobRequisitionId, jobRequisitionId))
    .orderBy(desc(workPermitChecklists.updatedAt));

  return rows.map((r) => ({
    ...r.checklist,
    personName: `${r.firstName} ${r.lastName}`.trim(),
  }));
}

/**
 * Fetch a single checklist by (requisition, person). Returns null when
 * none exists — the caller can then render an empty scaffold and offer
 * to save (which will insert on first save).
 */
export async function fetchChecklist(input: {
  jobRequisitionId: string;
  personId: string;
}): Promise<WorkPermitChecklist | null> {
  await requireInternalStaff();
  const [row] = await db
    .select()
    .from(workPermitChecklists)
    .where(
      and(
        eq(workPermitChecklists.jobRequisitionId, input.jobRequisitionId),
        eq(workPermitChecklists.personId, input.personId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert or update a checklist for (requisition, person). Idempotent —
 * safe to call every time staff hits Save. Records an audit event on
 * every write so we can trace who changed what.
 */
export async function upsertChecklist(
  input: UpsertWorkPermitChecklistInput,
): Promise<WorkPermitChecklist> {
  const session = await requireInternalStaff();
  const parsed = UpsertWorkPermitChecklistSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid checklist',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    // Confirm the linked requisition + person actually exist.
    const [req] = await tx
      .select({ id: jobRequisitions.id })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.id, d.jobRequisitionId))
      .limit(1);
    if (!req) throw new BusinessRuleError('NOT_FOUND', 'Requisition not found');
    const [p] = await tx
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.id, d.personId))
      .limit(1);
    if (!p) throw new BusinessRuleError('NOT_FOUND', 'Person not found');

    const [existing] = await tx
      .select()
      .from(workPermitChecklists)
      .where(
        and(
          eq(workPermitChecklists.jobRequisitionId, d.jobRequisitionId),
          eq(workPermitChecklists.personId, d.personId),
        ),
      )
      .limit(1);

    if (existing) {
      const [after] = await tx
        .update(workPermitChecklists)
        .set({
          contractSignedOn: blankToNull(d.contractSignedOn),
          commencementDate: blankToNull(d.commencementDate),
          matchChecks: d.matchChecks,
          advertInfoChecks: d.advertInfoChecks,
          documentsChecks: d.documentsChecks,
          notes: blankToNull(d.notes ?? undefined),
          updatedByUserId: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(workPermitChecklists.id, existing.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'work_permit_checklist',
        entityId: after.id,
        action: 'UPDATED',
        context: { jobRequisitionId: d.jobRequisitionId, personId: d.personId },
      });
      return after;
    }

    const [created] = await tx
      .insert(workPermitChecklists)
      .values({
        jobRequisitionId: d.jobRequisitionId,
        personId: d.personId,
        contractSignedOn: blankToNull(d.contractSignedOn),
        commencementDate: blankToNull(d.commencementDate),
        matchChecks: d.matchChecks,
        advertInfoChecks: d.advertInfoChecks,
        documentsChecks: d.documentsChecks,
        notes: blankToNull(d.notes ?? undefined),
        createdByUserId: session.user.id,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'work_permit_checklist',
      entityId: created.id,
      action: 'CREATED',
      after: { jobRequisitionId: d.jobRequisitionId, personId: d.personId },
    });
    return created;
  });
}

export async function deleteChecklist(id: string): Promise<void> {
  const session = await requireInternalStaff();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(workPermitChecklists)
      .where(eq(workPermitChecklists.id, id))
      .limit(1);
    if (!before) return;
    await tx.delete(workPermitChecklists).where(eq(workPermitChecklists.id, id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'work_permit_checklist',
      entityId: id,
      action: 'DELETED',
      before: { jobRequisitionId: before.jobRequisitionId, personId: before.personId },
    });
  });
}
