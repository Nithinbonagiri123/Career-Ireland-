import { desc, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type ImmigrationCase, immigrationCases } from '@/lib/db/schema/immigration';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type UpdateCaseStatusInput,
  UpdateCaseStatusSchema,
  type UpsertCaseInput,
  UpsertCaseSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

function blankToUndef(v: string | undefined | null): string | undefined {
  return v && v.trim().length > 0 ? v : undefined;
}

export type CaseListRow = ImmigrationCase & {
  beneficiaryName: string;
  sponsorName: string | null;
};

export async function fetchCases(): Promise<CaseListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      c: immigrationCases,
      firstName: persons.firstName,
      lastName: persons.lastName,
      sponsorName: employers.legalName,
    })
    .from(immigrationCases)
    .innerJoin(persons, eq(persons.id, immigrationCases.beneficiaryPersonId))
    .leftJoin(employers, eq(employers.id, immigrationCases.sponsorEmployerId))
    .where(isNull(immigrationCases.archivedAt))
    .orderBy(desc(immigrationCases.createdAt));
  return rows.map((r) => ({
    ...r.c,
    beneficiaryName: `${r.firstName} ${r.lastName}`,
    sponsorName: r.sponsorName,
  }));
}

export async function upsertCase(input: UpsertCaseInput): Promise<ImmigrationCase> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpsertCaseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid immigration case',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    caseType: d.caseType,
    beneficiaryPersonId: d.beneficiaryPersonId,
    sponsorEmployerId: blankToUndef(d.sponsorEmployerId),
    relatedPlacementId: blankToUndef(d.relatedPlacementId),
    relatedJobRequisitionId: blankToUndef(d.relatedJobRequisitionId),
    serviceEngagementId: blankToUndef(d.serviceEngagementId),
    status: d.status,
    authorityReference: blankToNull(d.authorityReference),
    submittedAt: blankToNull(d.submittedAt),
    decisionAt: blankToNull(d.decisionAt),
    expiresOn: blankToNull(d.expiresOn),
    notes: blankToNull(d.notes),
  };

  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx
        .select()
        .from(immigrationCases)
        .where(eq(immigrationCases.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('CASE_NOT_FOUND', 'Immigration case not found');
      const [after] = await tx
        .update(immigrationCases)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(immigrationCases.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'immigration_case',
        entityId: after.id,
        action: 'UPDATED',
        before: { status: before.status, caseType: before.caseType },
        after: { status: after.status, caseType: after.caseType },
      });
      return after;
    }
    const [created] = await tx.insert(immigrationCases).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case',
      entityId: created.id,
      action: 'CREATED',
      after: {
        caseType: created.caseType,
        beneficiaryPersonId: created.beneficiaryPersonId,
        status: created.status,
      },
    });
    return created;
  });
}

export async function updateCaseStatus(input: UpdateCaseStatusInput): Promise<ImmigrationCase> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateCaseStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(immigrationCases)
      .where(eq(immigrationCases.id, parsed.caseId))
      .limit(1);
    if (!before) throw new BusinessRuleError('CASE_NOT_FOUND', 'Immigration case not found');
    if (before.status === parsed.status) return before;
    const [after] = await tx
      .update(immigrationCases)
      .set({
        status: parsed.status,
        authorityReference: parsed.authorityReference
          ? parsed.authorityReference
          : before.authorityReference,
        submittedAt:
          parsed.status === 'SUBMITTED' && !before.submittedAt
            ? new Date().toISOString().slice(0, 10)
            : before.submittedAt,
        decisionAt:
          (parsed.status === 'APPROVED' || parsed.status === 'REJECTED') && !before.decisionAt
            ? new Date().toISOString().slice(0, 10)
            : before.decisionAt,
        updatedAt: sql`NOW()`,
      })
      .where(eq(immigrationCases.id, parsed.caseId))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  });
}
