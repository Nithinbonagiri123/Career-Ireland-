import { and, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import {
  requireInternalStaff,
  requirePortalCandidate,
  requireRole,
  requireSession,
} from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import {
  type CandidateDocumentRequirement,
  candidateDocumentRequirements,
  type DocumentInstance,
  type DocumentRequirementRule,
  documentInstances,
  documentRequirementFulfillments,
  documentRequirementRules,
} from '@/lib/db/schema/documents';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { documentTypes } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { DOCUMENTS_BUCKET } from '@/lib/s3/client';
import {
  ALLOWED_UPLOAD_MIME,
  buildObjectKey,
  MAX_UPLOAD_BYTES,
  presignDownload,
  presignUpload,
} from '@/lib/s3/presign';
import {
  type AddRequirementForPersonInput,
  AddRequirementForPersonSchema,
  type MaterializeRequirementsInput,
  MaterializeRequirementsSchema,
  type PresignUploadInput,
  PresignUploadSchema,
  type RegisterUploadInput,
  RegisterUploadSchema,
  type ReviewDocumentInput,
  ReviewDocumentSchema,
  type UpsertRequirementRuleInput,
  UpsertRequirementRuleSchema,
  type VoidDocumentInput,
  VoidDocumentSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

/**
 * Portal candidates may only manage documents for themselves; staff may manage anyone.
 * Enforce here so no upstream caller can accidentally bypass it.
 */
async function assertOwnershipOrStaff(
  ownerType: 'PERSON' | 'EMPLOYER',
  ownerId: string,
): Promise<{ userId: string }> {
  const session = await requireSession();
  const role = session.user.role;

  if (role === 'ADMIN' || role === 'STAFF') return { userId: session.user.id };

  if (role === 'CANDIDATE') {
    if (ownerType !== 'PERSON' || session.user.personId !== ownerId) {
      throw new BusinessRuleError('FORBIDDEN', 'You can only manage your own documents');
    }
    return { userId: session.user.id };
  }

  if (role === 'EMPLOYER') {
    if (ownerType !== 'EMPLOYER' || session.user.employerId !== ownerId) {
      throw new BusinessRuleError('FORBIDDEN', 'You can only manage your own documents');
    }
    return { userId: session.user.id };
  }

  throw new BusinessRuleError('FORBIDDEN', 'Not permitted');
}

// --------- Upload flow ---------

export async function presignDocumentUpload(input: PresignUploadInput) {
  const parsed = PresignUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid upload request',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  await assertOwnershipOrStaff(d.ownerType, d.ownerId);

  if (!ALLOWED_UPLOAD_MIME.has(d.mimeType)) {
    throw new BusinessRuleError(
      'MIME_NOT_ALLOWED',
      `File type ${d.mimeType} is not allowed. PDF, images, or Word documents only.`,
    );
  }
  if (d.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new BusinessRuleError(
      'FILE_TOO_LARGE',
      `File exceeds ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`,
    );
  }

  const key = buildObjectKey({
    ownerType: d.ownerType === 'PERSON' ? 'person' : 'employer',
    ownerId: d.ownerId,
    documentTypeId: d.documentTypeId,
    originalFilename: d.originalFilename,
  });
  const { url, expiresInSeconds } = await presignUpload({
    key,
    mimeType: d.mimeType,
    fileSizeBytes: d.fileSizeBytes,
  });
  return { uploadUrl: url, bucket: DOCUMENTS_BUCKET, key, expiresInSeconds };
}

export async function registerUpload(input: RegisterUploadInput): Promise<DocumentInstance> {
  const parsed = RegisterUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid upload registration',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const { userId } = await assertOwnershipOrStaff(d.ownerType, d.ownerId);

  // Defence-in-depth: presign already gated these, but the client could call
  // register directly with a spoofed MIME or size. Re-enforce so the DB row
  // can't lie about what's actually stored.
  if (!ALLOWED_UPLOAD_MIME.has(d.mimeType)) {
    throw new BusinessRuleError(
      'MIME_NOT_ALLOWED',
      `File type ${d.mimeType} is not allowed. PDF, images, or Word documents only.`,
    );
  }
  if (d.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new BusinessRuleError(
      'FILE_TOO_LARGE',
      `File exceeds ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`,
    );
  }

  return db.transaction(async (tx) => {
    // Determine next version for this owner+type.
    const ownerFilter =
      d.ownerType === 'PERSON'
        ? eq(documentInstances.ownerPersonId, d.ownerId)
        : eq(documentInstances.ownerEmployerId, d.ownerId);
    const [latest] = await tx
      .select({ version: documentInstances.version })
      .from(documentInstances)
      .where(and(ownerFilter, eq(documentInstances.documentTypeId, d.documentTypeId)))
      .orderBy(desc(documentInstances.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    const [instance] = await tx
      .insert(documentInstances)
      .values({
        ownerPersonId: d.ownerType === 'PERSON' ? d.ownerId : null,
        ownerEmployerId: d.ownerType === 'EMPLOYER' ? d.ownerId : null,
        documentTypeId: d.documentTypeId,
        version: nextVersion,
        status: 'UPLOADED',
        originalFilename: d.originalFilename,
        mimeType: d.mimeType,
        fileSizeBytes: d.fileSizeBytes,
        s3Bucket: DOCUMENTS_BUCKET,
        s3ObjectKey: d.s3ObjectKey,
        uploadedByUserId: userId,
        expiresOn: blankToNull(d.expiresOn),
      })
      .returning();
    if (!instance) throw new Error('document_instances insert returned no row');

    await recordAudit(tx, {
      actorUserId: userId,
      entityType: 'document_instance',
      entityId: instance.id,
      action: 'UPLOADED',
      after: {
        documentTypeId: instance.documentTypeId,
        version: instance.version,
        originalFilename: instance.originalFilename,
        fileSizeBytes: instance.fileSizeBytes,
      },
      context: { ownerType: d.ownerType, ownerId: d.ownerId },
    });

    // Fulfil requirements + move their status to PROVIDED (staff will accept/reject in review).
    if (d.fulfilRequirementIds && d.fulfilRequirementIds.length > 0) {
      for (const requirementId of d.fulfilRequirementIds) {
        await tx
          .insert(documentRequirementFulfillments)
          .values({ requirementId, documentInstanceId: instance.id, fulfilledByUserId: userId })
          .onConflictDoNothing({
            target: [
              documentRequirementFulfillments.requirementId,
              documentRequirementFulfillments.documentInstanceId,
            ],
          });
      }
      await tx
        .update(candidateDocumentRequirements)
        .set({ status: 'PROVIDED', updatedAt: sql`NOW()` })
        .where(inArray(candidateDocumentRequirements.id, d.fulfilRequirementIds));
    }

    return instance;
  });
}

// --------- Download flow ---------

export async function presignDocumentDownload(documentInstanceId: string) {
  const session = await requireSession();
  const [instance] = await db
    .select()
    .from(documentInstances)
    .where(eq(documentInstances.id, documentInstanceId))
    .limit(1);
  if (!instance) throw new BusinessRuleError('NOT_FOUND', 'Document not found');

  const role = session.user.role;
  if (role === 'ADMIN' || role === 'STAFF') {
    // ok
  } else if (role === 'CANDIDATE') {
    if (instance.ownerPersonId !== session.user.personId) {
      throw new BusinessRuleError('FORBIDDEN', 'Not your document');
    }
  } else if (role === 'EMPLOYER') {
    if (instance.ownerEmployerId !== session.user.employerId) {
      throw new BusinessRuleError('FORBIDDEN', 'Not your document');
    }
  } else {
    throw new BusinessRuleError('FORBIDDEN', 'Not permitted');
  }

  const url = await presignDownload({ key: instance.s3ObjectKey });
  return { url, instance };
}

// --------- Review flow ---------

export async function reviewDocument(input: ReviewDocumentInput): Promise<DocumentInstance> {
  // Document review is a substantive quality decision on candidate
  // eligibility. Restricted to ADMIN + DOCUMENT_SPECIALIST so a
  // recruiter accepting a doc as "looks fine" doesn't count as the
  // official review the compliance trail depends on.
  const session = await requireRole(['ADMIN', 'DOCUMENT_SPECIALIST']);
  const parsed = ReviewDocumentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid review',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(documentInstances)
      .where(eq(documentInstances.id, d.documentInstanceId))
      .limit(1);
    if (!before) throw new BusinessRuleError('NOT_FOUND', 'Document not found');
    if (before.status === 'ACCEPTED' || before.status === 'REJECTED') {
      throw new BusinessRuleError(
        'ALREADY_REVIEWED',
        `Document already ${before.status.toLowerCase()} — upload a new version instead`,
      );
    }

    const [after] = await tx
      .update(documentInstances)
      .set({
        status: d.decision,
        reviewNotes: blankToNull(d.reviewNotes),
        updatedAt: sql`NOW()`,
      })
      .where(eq(documentInstances.id, d.documentInstanceId))
      .returning();
    if (!after) throw new Error('update returned no row');

    // Propagate to any requirements this document fulfils.
    const requirementRows = await tx
      .select({ requirementId: documentRequirementFulfillments.requirementId })
      .from(documentRequirementFulfillments)
      .where(eq(documentRequirementFulfillments.documentInstanceId, after.id));
    const reqIds = requirementRows.map((r) => r.requirementId);
    if (reqIds.length > 0) {
      await tx
        .update(candidateDocumentRequirements)
        .set({ status: d.decision, updatedAt: sql`NOW()` })
        .where(inArray(candidateDocumentRequirements.id, reqIds));
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_instance',
      entityId: after.id,
      action: d.decision === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
      before: { status: before.status },
      after: { status: after.status },
      context: d.reviewNotes ? { reviewNotes: d.reviewNotes } : undefined,
    });

    return after;
  });
}

// --------- Requirement rules (staff admin) ---------

export async function fetchRequirementRules(): Promise<
  Array<DocumentRequirementRule & { documentTypeCode: string; documentTypeName: string }>
> {
  await requireInternalStaff();
  const rows = await db
    .select({
      rule: documentRequirementRules,
      code: documentTypes.code,
      name: documentTypes.name,
    })
    .from(documentRequirementRules)
    .innerJoin(documentTypes, eq(documentTypes.id, documentRequirementRules.documentTypeId))
    .orderBy(desc(documentRequirementRules.createdAt));
  return rows.map((r) => ({ ...r.rule, documentTypeCode: r.code, documentTypeName: r.name }));
}

export async function upsertRequirementRule(
  input: UpsertRequirementRuleInput,
): Promise<DocumentRequirementRule> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertRequirementRuleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid requirement rule',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const scopeRefId = d.scope === 'GLOBAL' ? null : blankToNull(d.scopeRefId);
  if (d.scope !== 'GLOBAL' && !scopeRefId) {
    throw new BusinessRuleError('SCOPE_REF_REQUIRED', 'Select a target for non-global rules');
  }

  const values = {
    documentTypeId: d.documentTypeId,
    scope: d.scope,
    scopeRefId,
    notes: blankToNull(d.notes),
  };

  return db.transaction(async (tx) => {
    if (d.id) {
      const [after] = await tx
        .update(documentRequirementRules)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(documentRequirementRules.id, d.id))
        .returning();
      if (!after) throw new BusinessRuleError('NOT_FOUND', 'Rule not found');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'document_requirement_rule',
        entityId: after.id,
        action: 'UPDATED',
        after: values,
      });
      return after;
    }
    const [created] = await tx.insert(documentRequirementRules).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_requirement_rule',
      entityId: created.id,
      action: 'CREATED',
      after: values,
    });
    return created;
  });
}

export async function deleteRequirementRule(id: string): Promise<void> {
  const session = await requireRole(['ADMIN']);
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(documentRequirementRules)
      .where(eq(documentRequirementRules.id, id))
      .limit(1);
    if (!before) throw new BusinessRuleError('NOT_FOUND', 'Rule not found');
    await tx.delete(documentRequirementRules).where(eq(documentRequirementRules.id, id));
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_requirement_rule',
      entityId: id,
      action: 'DELETED',
      before: { scope: before.scope, documentTypeId: before.documentTypeId },
    });
  });
}

// --------- Per-person requirements ---------

export type PersonRequirementRow = CandidateDocumentRequirement & {
  documentTypeCode: string;
  documentTypeName: string;
  hasExpiry: boolean;
  appliesTo: 'PERSON' | 'EMPLOYER' | 'BOTH';
};

async function assertCanReadPersonDocs(personId: string): Promise<void> {
  const session = await requireSession();
  const role = session.user.role;
  if (role === 'ADMIN' || role === 'STAFF') return;
  if (role === 'CANDIDATE' && session.user.personId === personId) return;
  throw new BusinessRuleError('FORBIDDEN', 'Not permitted');
}

export async function fetchPersonRequirements(personId: string): Promise<PersonRequirementRow[]> {
  await assertCanReadPersonDocs(personId);
  const rows = await db
    .select({
      req: candidateDocumentRequirements,
      code: documentTypes.code,
      name: documentTypes.name,
      hasExpiry: documentTypes.hasExpiry,
      appliesTo: documentTypes.appliesTo,
    })
    .from(candidateDocumentRequirements)
    .innerJoin(documentTypes, eq(documentTypes.id, candidateDocumentRequirements.documentTypeId))
    .where(eq(candidateDocumentRequirements.personId, personId))
    .orderBy(candidateDocumentRequirements.status, documentTypes.name);
  return rows.map((r) => ({
    ...r.req,
    documentTypeCode: r.code,
    documentTypeName: r.name,
    hasExpiry: r.hasExpiry,
    appliesTo: r.appliesTo,
  }));
}

export async function fetchPersonDocuments(personId: string): Promise<DocumentInstance[]> {
  await assertCanReadPersonDocs(personId);
  return db
    .select()
    .from(documentInstances)
    .where(and(eq(documentInstances.ownerPersonId, personId), isNull(documentInstances.voidedAt)))
    .orderBy(desc(documentInstances.createdAt));
}

/** Fetch a person's documents filtered by document-type code (e.g. 'CV', 'PAYMENT_PROOF'). */
export async function fetchPersonDocumentsByTypeCode(
  personId: string,
  typeCode: string,
): Promise<DocumentInstance[]> {
  await assertCanReadPersonDocs(personId);
  const rows = await db
    .select({ doc: documentInstances })
    .from(documentInstances)
    .innerJoin(documentTypes, eq(documentTypes.id, documentInstances.documentTypeId))
    .where(
      and(
        eq(documentInstances.ownerPersonId, personId),
        eq(documentTypes.code, typeCode),
        isNull(documentInstances.voidedAt),
      ),
    )
    .orderBy(desc(documentInstances.createdAt));
  return rows.map((r) => r.doc);
}

/**
 * Materialise requirement rules for a person: for every applicable rule
 * (currently: candidate's primary occupation + GLOBAL rules), insert a
 * MISSING candidate_document_requirements row if one doesn't exist yet.
 * Idempotent — safe to call repeatedly (e.g. after occupation change).
 */
export async function materialiseRequirementsForPerson(
  input: MaterializeRequirementsInput,
): Promise<{ created: number }> {
  const session = await requireInternalStaff();
  const parsed = MaterializeRequirementsSchema.parse(input);

  const [profile] = await db
    .select({
      personId: candidateProfiles.personId,
      occupationId: candidateProfiles.primaryOccupationId,
    })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, parsed.personId))
    .limit(1);
  if (!profile) throw new BusinessRuleError('NO_PROFILE', 'Person has no candidate profile');

  const scopeConditions = [
    eq(documentRequirementRules.scope, 'GLOBAL'),
    profile.occupationId
      ? and(
          eq(documentRequirementRules.scope, 'OCCUPATION'),
          eq(documentRequirementRules.scopeRefId, profile.occupationId),
        )
      : undefined,
  ].filter(Boolean);
  const applicableRules = await db
    .select()
    .from(documentRequirementRules)
    .where(or(...scopeConditions));

  if (applicableRules.length === 0) return { created: 0 };

  return db.transaction(async (tx) => {
    let created = 0;
    for (const rule of applicableRules) {
      const [existing] = await tx
        .select({ id: candidateDocumentRequirements.id })
        .from(candidateDocumentRequirements)
        .where(
          and(
            eq(candidateDocumentRequirements.personId, parsed.personId),
            eq(candidateDocumentRequirements.documentTypeId, rule.documentTypeId),
          ),
        )
        .limit(1);
      if (existing) continue;

      await tx.insert(candidateDocumentRequirements).values({
        personId: parsed.personId,
        documentTypeId: rule.documentTypeId,
        status: 'MISSING',
        sourceRuleId: rule.id,
      });
      created += 1;
    }

    if (created > 0) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'person',
        entityId: parsed.personId,
        action: 'REQUIREMENTS_MATERIALIZED',
        context: { created, rulesConsidered: applicableRules.length },
      });
    }
    return { created };
  });
}

export async function addPersonSpecificRequirement(
  input: AddRequirementForPersonInput,
): Promise<CandidateDocumentRequirement> {
  const session = await requireInternalStaff();
  const parsed = AddRequirementForPersonSchema.parse(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(candidateDocumentRequirements)
      .where(
        and(
          eq(candidateDocumentRequirements.personId, parsed.personId),
          eq(candidateDocumentRequirements.documentTypeId, parsed.documentTypeId),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(candidateDocumentRequirements)
      .values({
        personId: parsed.personId,
        documentTypeId: parsed.documentTypeId,
        status: 'MISSING',
        notes: blankToNull(parsed.notes),
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_document_requirement',
      entityId: created.id,
      action: 'CREATED',
      after: { documentTypeId: created.documentTypeId },
      context: { candidateSpecific: true },
    });
    return created;
  });
}

// --------- Staff-wide list ---------

export type StaffDocumentRow = DocumentInstance & {
  ownerName: string;
  ownerKind: 'PERSON' | 'EMPLOYER';
  documentTypeName: string;
};

export async function fetchAllDocumentsForStaff(
  createdRange?: DateRange,
): Promise<StaffDocumentRow[]> {
  await requireInternalStaff();
  const createdCond = createdRange
    ? dateRangeWhere(documentInstances.createdAt, createdRange)
    : undefined;
  const whereConds: SQL[] = [isNull(documentInstances.voidedAt)];
  if (createdCond) whereConds.push(createdCond);
  const rows = await db
    .select({
      instance: documentInstances,
      typeName: documentTypes.name,
      personFirst: persons.firstName,
      personLast: persons.lastName,
    })
    .from(documentInstances)
    .innerJoin(documentTypes, eq(documentTypes.id, documentInstances.documentTypeId))
    .leftJoin(persons, eq(persons.id, documentInstances.ownerPersonId))
    .where(and(...whereConds))
    .orderBy(desc(documentInstances.createdAt));
  return rows.map((r) => ({
    ...r.instance,
    documentTypeName: r.typeName,
    ownerKind: r.instance.ownerPersonId ? 'PERSON' : 'EMPLOYER',
    ownerName:
      r.personFirst && r.personLast
        ? `${r.personFirst} ${r.personLast}`
        : (r.instance.ownerEmployerId ?? '(unknown)'),
  }));
}

// --------- Portal candidate helpers ---------

export async function fetchMyRequirementsAndDocuments() {
  const session = await requirePortalCandidate();
  const [reqs, docs] = await Promise.all([
    fetchPersonRequirements(session.user.personId),
    fetchPersonDocuments(session.user.personId),
  ]);
  return { requirements: reqs, documents: docs };
}

// --------- Void (soft-delete) ---------

/**
 * Soft-void a document. Hidden from every list, export, and requirement
 * fulfilment check, but the DB row + S3 object stay for the audit trail.
 * ADMIN + DOCUMENT_SPECIALIST only — voiding hides evidence, so it
 * matches the same authorisation tier as review. Re-uploading a
 * corrected version via the normal upload flow bumps the version and
 * leaves the voided row untouched.
 */
export async function voidDocument(input: VoidDocumentInput) {
  const session = await requireRole(['ADMIN', 'DOCUMENT_SPECIALIST']);
  const parsed = VoidDocumentSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(documentInstances)
      .where(eq(documentInstances.id, parsed.documentInstanceId))
      .limit(1);
    if (!before) throw new BusinessRuleError('NOT_FOUND', 'Document not found');
    if (before.voidedAt) {
      throw new BusinessRuleError('ALREADY_VOIDED', 'Document is already voided');
    }

    const [after] = await tx
      .update(documentInstances)
      .set({
        voidedAt: new Date(),
        voidedByUserId: session.user.id,
        voidReason: parsed.reason,
        updatedAt: sql`NOW()`,
      })
      .where(eq(documentInstances.id, parsed.documentInstanceId))
      .returning();
    if (!after) throw new Error('void returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_instance',
      entityId: after.id,
      action: 'VOIDED',
      before: { voidedAt: null },
      after: { voidedAt: after.voidedAt },
      context: {
        reason: parsed.reason,
        originalFilename: after.originalFilename,
      },
    });

    return after;
  });
}
