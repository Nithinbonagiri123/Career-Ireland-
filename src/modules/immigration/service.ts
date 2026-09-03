import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type DocumentInstance, documentInstances } from '@/lib/db/schema/documents';
import {
  type ImmigrationCase,
  type ImmigrationCaseDocument,
  type ImmigrationCaseDocumentRequirement,
  immigrationCaseDocumentRequirements,
  immigrationCaseDocuments,
  immigrationCases,
} from '@/lib/db/schema/immigration';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import { type DocumentType, documentTypes } from '@/lib/db/schema/reference';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';
import { assertTransition, IMMIGRATION_CASE_TRANSITIONS } from '@/lib/state-machine';
import {
  type AddCaseDocumentRequirementInput,
  AddCaseDocumentRequirementSchema,
  type ArchiveCaseInput,
  ArchiveCaseSchema,
  type AttachCaseDocumentInput,
  AttachCaseDocumentSchema,
  type DetachCaseDocumentInput,
  DetachCaseDocumentSchema,
  type RemoveCaseDocumentRequirementInput,
  RemoveCaseDocumentRequirementSchema,
  type UnarchiveCaseInput,
  UnarchiveCaseSchema,
  type UpdateCaseDocumentRequirementInput,
  UpdateCaseDocumentRequirementSchema,
  type UpdateCaseStatusInput,
  UpdateCaseStatusSchema,
  type UpsertCaseInput,
  UpsertCaseSchema,
} from './schemas';
import { ensureExpiryReminder, generateCaseTasks } from './task-generator';

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

export async function fetchCase(id: string): Promise<CaseListRow | null> {
  await requireRole(['ADMIN', 'STAFF']);
  const [row] = await db
    .select({
      c: immigrationCases,
      firstName: persons.firstName,
      lastName: persons.lastName,
      sponsorName: employers.legalName,
    })
    .from(immigrationCases)
    .innerJoin(persons, eq(persons.id, immigrationCases.beneficiaryPersonId))
    .leftJoin(employers, eq(employers.id, immigrationCases.sponsorEmployerId))
    .where(eq(immigrationCases.id, id))
    .limit(1);
  return row
    ? {
        ...row.c,
        beneficiaryName: `${row.firstName} ${row.lastName}`,
        sponsorName: row.sponsorName,
      }
    : null;
}

export async function fetchCases(scope?: AssignmentScope): Promise<CaseListRow[]> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const scopeCond = scope
    ? assignmentCondition(scope, immigrationCases.assignedUserId, session.user.id)
    : undefined;
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
    .where(
      scopeCond
        ? and(isNull(immigrationCases.archivedAt), scopeCond)
        : isNull(immigrationCases.archivedAt),
    )
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
      // Refresh the expiry reminder task if expiresOn was set / changed.
      if (after.expiresOn && after.expiresOn !== before.expiresOn) {
        await ensureExpiryReminder(tx, {
          caseId: after.id,
          expiresOn: after.expiresOn,
          actorUserId: session.user.id,
          caseAssignedUserId: after.assignedUserId,
        });
      }
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
    // Fire the standard "kick off the case" task set.
    await generateCaseTasks(tx, {
      caseId: created.id,
      trigger: 'CREATED',
      actorUserId: session.user.id,
      caseAssignedUserId: created.assignedUserId,
    });
    // Also seed the expiry reminder if the case was created with an expiresOn.
    if (created.expiresOn) {
      await ensureExpiryReminder(tx, {
        caseId: created.id,
        expiresOn: created.expiresOn,
        actorUserId: session.user.id,
        caseAssignedUserId: created.assignedUserId,
      });
    }
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
    assertTransition(
      'immigration case',
      before.status,
      parsed.status,
      IMMIGRATION_CASE_TRANSITIONS,
    );
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
    // Auto-generate the tasks for the new status (idempotent per template title).
    await generateCaseTasks(tx, {
      caseId: after.id,
      trigger: after.status,
      actorUserId: session.user.id,
      caseAssignedUserId: after.assignedUserId,
    });
    return after;
  });
}

// ─── Case document requirements ───────────────────────────────────────────────

export type CaseDocumentRequirementRow = ImmigrationCaseDocumentRequirement & {
  documentTypeName: string;
  documentTypeCode: string;
  hasExpiry: boolean;
};

export async function listCaseDocumentRequirements(
  caseId: string,
): Promise<CaseDocumentRequirementRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({ req: immigrationCaseDocumentRequirements, type: documentTypes })
    .from(immigrationCaseDocumentRequirements)
    .innerJoin(
      documentTypes,
      eq(documentTypes.id, immigrationCaseDocumentRequirements.documentTypeId),
    )
    .where(eq(immigrationCaseDocumentRequirements.immigrationCaseId, caseId))
    .orderBy(desc(immigrationCaseDocumentRequirements.isMandatory), asc(documentTypes.name));
  return rows.map((r) => ({
    ...r.req,
    documentTypeName: r.type.name,
    documentTypeCode: r.type.code,
    hasExpiry: r.type.hasExpiry,
  }));
}

export async function addCaseDocumentRequirement(
  input: AddCaseDocumentRequirementInput,
): Promise<ImmigrationCaseDocumentRequirement> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = AddCaseDocumentRequirementSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(immigrationCaseDocumentRequirements)
      .where(
        and(
          eq(immigrationCaseDocumentRequirements.immigrationCaseId, parsed.immigrationCaseId),
          eq(immigrationCaseDocumentRequirements.documentTypeId, parsed.documentTypeId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'DUPLICATE_REQUIREMENT',
        'This document requirement is already on the case',
      );
    }
    const [row] = await tx
      .insert(immigrationCaseDocumentRequirements)
      .values({
        immigrationCaseId: parsed.immigrationCaseId,
        documentTypeId: parsed.documentTypeId,
        isMandatory: parsed.isMandatory,
        notes: parsed.notes && parsed.notes.trim().length > 0 ? parsed.notes : null,
        status: 'MISSING',
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case_document_requirement',
      entityId: row.id,
      action: 'CREATED',
      after: {
        immigrationCaseId: row.immigrationCaseId,
        documentTypeId: row.documentTypeId,
        isMandatory: row.isMandatory,
      },
    });
    return row;
  });
}

export async function updateCaseDocumentRequirement(
  input: UpdateCaseDocumentRequirementInput,
): Promise<ImmigrationCaseDocumentRequirement> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateCaseDocumentRequirementSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(immigrationCaseDocumentRequirements)
      .where(eq(immigrationCaseDocumentRequirements.id, parsed.requirementId))
      .limit(1);
    if (!before) throw new NotFoundError('Case document requirement');
    const [after] = await tx
      .update(immigrationCaseDocumentRequirements)
      .set({
        status: parsed.status,
        notes: parsed.notes && parsed.notes.trim().length > 0 ? parsed.notes : before.notes,
        updatedAt: sql`NOW()`,
      })
      .where(eq(immigrationCaseDocumentRequirements.id, parsed.requirementId))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case_document_requirement',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  });
}

export async function removeCaseDocumentRequirement(
  input: RemoveCaseDocumentRequirementInput,
): Promise<void> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = RemoveCaseDocumentRequirementSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(immigrationCaseDocumentRequirements)
      .where(eq(immigrationCaseDocumentRequirements.id, parsed.requirementId))
      .limit(1);
    if (!before) return;
    await tx
      .delete(immigrationCaseDocumentRequirements)
      .where(eq(immigrationCaseDocumentRequirements.id, parsed.requirementId));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case_document_requirement',
      entityId: before.id,
      action: 'DELETED',
      before: {
        immigrationCaseId: before.immigrationCaseId,
        documentTypeId: before.documentTypeId,
      },
    });
  });
}

// ─── Case → documents linking ─────────────────────────────────────────────────

export type CaseDocumentRow = ImmigrationCaseDocument & {
  document: DocumentInstance;
  documentType: DocumentType;
};

export async function listCaseDocuments(caseId: string): Promise<CaseDocumentRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      link: immigrationCaseDocuments,
      doc: documentInstances,
      docType: documentTypes,
    })
    .from(immigrationCaseDocuments)
    .innerJoin(
      documentInstances,
      eq(documentInstances.id, immigrationCaseDocuments.documentInstanceId),
    )
    .innerJoin(documentTypes, eq(documentTypes.id, documentInstances.documentTypeId))
    .where(eq(immigrationCaseDocuments.immigrationCaseId, caseId))
    .orderBy(desc(immigrationCaseDocuments.attachedAt));
  return rows.map((r) => ({ ...r.link, document: r.doc, documentType: r.docType }));
}

/**
 * Attach an existing DocumentInstance (already uploaded, owned by a Person or Employer)
 * to an immigration case. If `caseRequirementId` is provided, the corresponding requirement
 * flips to PROVIDED automatically.
 */
export async function attachDocumentToCase(
  input: AttachCaseDocumentInput,
): Promise<ImmigrationCaseDocument> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = AttachCaseDocumentSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(immigrationCaseDocuments)
      .where(
        and(
          eq(immigrationCaseDocuments.immigrationCaseId, parsed.immigrationCaseId),
          eq(immigrationCaseDocuments.documentInstanceId, parsed.documentInstanceId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError('ALREADY_ATTACHED', 'Document is already attached to this case');
    }

    const requirementId =
      parsed.caseRequirementId && parsed.caseRequirementId.length > 0
        ? parsed.caseRequirementId
        : null;

    const [row] = await tx
      .insert(immigrationCaseDocuments)
      .values({
        immigrationCaseId: parsed.immigrationCaseId,
        documentInstanceId: parsed.documentInstanceId,
        caseRequirementId: requirementId,
        attachedByUserId: session.user.id,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');

    if (requirementId) {
      await tx
        .update(immigrationCaseDocumentRequirements)
        .set({ status: 'PROVIDED', updatedAt: sql`NOW()` })
        .where(eq(immigrationCaseDocumentRequirements.id, requirementId));
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case_document',
      entityId: parsed.immigrationCaseId,
      action: 'DOCUMENT_ATTACHED',
      after: {
        documentInstanceId: parsed.documentInstanceId,
        requirementId,
      },
    });
    return row;
  });
}

export async function detachDocumentFromCase(input: DetachCaseDocumentInput): Promise<void> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = DetachCaseDocumentSchema.parse(input);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(immigrationCaseDocuments)
      .where(
        and(
          eq(immigrationCaseDocuments.immigrationCaseId, parsed.immigrationCaseId),
          eq(immigrationCaseDocuments.documentInstanceId, parsed.documentInstanceId),
        ),
      )
      .limit(1);
    if (!before) return;
    await tx
      .delete(immigrationCaseDocuments)
      .where(
        and(
          eq(immigrationCaseDocuments.immigrationCaseId, parsed.immigrationCaseId),
          eq(immigrationCaseDocuments.documentInstanceId, parsed.documentInstanceId),
        ),
      );
    // If detaching leaves the requirement without any linked doc, revert to MISSING.
    if (before.caseRequirementId) {
      const [stillLinked] = await tx
        .select({ id: immigrationCaseDocuments.documentInstanceId })
        .from(immigrationCaseDocuments)
        .where(eq(immigrationCaseDocuments.caseRequirementId, before.caseRequirementId))
        .limit(1);
      if (!stillLinked) {
        await tx
          .update(immigrationCaseDocumentRequirements)
          .set({ status: 'MISSING', updatedAt: sql`NOW()` })
          .where(eq(immigrationCaseDocumentRequirements.id, before.caseRequirementId));
      }
    }
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case_document',
      entityId: parsed.immigrationCaseId,
      action: 'DOCUMENT_DETACHED',
      before: { documentInstanceId: parsed.documentInstanceId },
    });
  });
}

// ─── Archive / unarchive ──────────────────────────────────────────────────────

/** Soft-archive an immigration case. List queries filter archived rows out; the record is untouched. */
export async function archiveCase(input: ArchiveCaseInput): Promise<ImmigrationCase> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = ArchiveCaseSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(immigrationCases)
      .where(eq(immigrationCases.id, parsed.caseId))
      .limit(1);
    if (!before) throw new BusinessRuleError('CASE_NOT_FOUND', 'Immigration case not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Case is already archived');
    }
    const [after] = await tx
      .update(immigrationCases)
      .set({ archivedAt: new Date(), updatedAt: sql`NOW()` })
      .where(eq(immigrationCases.id, parsed.caseId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/** Restore a previously archived immigration case back to the active list. */
export async function unarchiveCase(input: UnarchiveCaseInput): Promise<ImmigrationCase> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UnarchiveCaseSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(immigrationCases)
      .where(eq(immigrationCases.id, parsed.caseId))
      .limit(1);
    if (!before) throw new BusinessRuleError('CASE_NOT_FOUND', 'Immigration case not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Case is not archived');
    }
    const [after] = await tx
      .update(immigrationCases)
      .set({ archivedAt: null, updatedAt: sql`NOW()` })
      .where(eq(immigrationCases.id, parsed.caseId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_case',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}
