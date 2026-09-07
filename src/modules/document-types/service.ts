import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type DocumentType, documentTypes } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type SetActiveByIdInput,
  SetActiveByIdSchema,
  type UpsertDocumentTypeInput,
  UpsertDocumentTypeSchema,
} from './schemas';

export async function fetchDocumentTypes(): Promise<DocumentType[]> {
  await requireInternalStaff();
  return db.select().from(documentTypes).orderBy(asc(documentTypes.name));
}

/**
 * Idempotently fetch (or create) a document type by its stable machine `code`.
 * Used by workflows that need a well-known type to exist (e.g. PAYMENT_PROOF for
 * lead conversion) without forcing an admin to hand-configure it first.
 */
export async function ensureDocumentTypeByCode(args: {
  code: string;
  name: string;
  appliesTo?: 'PERSON' | 'EMPLOYER' | 'BOTH';
  hasExpiry?: boolean;
}): Promise<DocumentType> {
  await requireInternalStaff();
  const [existing] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.code, args.code))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(documentTypes)
    .values({
      code: args.code,
      name: args.name,
      appliesTo: args.appliesTo ?? 'PERSON',
      hasExpiry: args.hasExpiry ?? false,
      isActive: true,
    })
    .returning();
  if (!created) throw new Error('document type insert returned no row');
  return created;
}

async function getById(id: string): Promise<DocumentType | null> {
  const [row] = await db.select().from(documentTypes).where(eq(documentTypes.id, id)).limit(1);
  return row ?? null;
}

export async function upsertDocumentType(input: UpsertDocumentTypeInput): Promise<DocumentType> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertDocumentTypeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid document type',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    if (data.id) {
      const existing = await getById(data.id);
      if (!existing) throw new BusinessRuleError('DOC_TYPE_NOT_FOUND', 'Document type not found');
      const [after] = await tx
        .update(documentTypes)
        .set({
          code: data.code,
          name: data.name,
          hasExpiry: data.hasExpiry,
          appliesTo: data.appliesTo,
          isActive: data.isActive,
          updatedAt: sql`NOW()`,
        })
        .where(eq(documentTypes.id, data.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'document_type',
        entityId: after.id,
        action: 'UPDATED',
        before: {
          code: existing.code,
          name: existing.name,
          hasExpiry: existing.hasExpiry,
          appliesTo: existing.appliesTo,
          isActive: existing.isActive,
        },
        after: {
          code: after.code,
          name: after.name,
          hasExpiry: after.hasExpiry,
          appliesTo: after.appliesTo,
          isActive: after.isActive,
        },
      });
      return after;
    }
    const [created] = await tx
      .insert(documentTypes)
      .values({
        code: data.code,
        name: data.name,
        hasExpiry: data.hasExpiry,
        appliesTo: data.appliesTo,
        isActive: data.isActive,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_type',
      entityId: created.id,
      action: 'CREATED',
      after: {
        code: created.code,
        name: created.name,
        hasExpiry: created.hasExpiry,
        appliesTo: created.appliesTo,
      },
    });
    return created;
  });
}

export async function setDocumentTypeActive(input: SetActiveByIdInput): Promise<DocumentType> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getById(parsed.id);
    if (!existing) throw new BusinessRuleError('DOC_TYPE_NOT_FOUND', 'Document type not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(documentTypes)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(documentTypes.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'document_type',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}
