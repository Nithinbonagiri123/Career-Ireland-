/**
 * Reusable catalog service for the module-agnostic `business_case_types`
 * table. Every "sub-type" catalog across the business (advertisement channels,
 * candidate service tiers, recruitment campaign types, etc.) hits the same
 * shape:
 *   - fetchByModule (list, active-only optional)
 *   - upsert (admin CRUD)
 *   - createFromName (inline "+ New" any-staff)
 *   - setActive (admin toggle)
 *
 * A new module only needs to (a) add the string to the module enum in the
 * schema and (b) wire the admin page + picker — no new service code.
 */
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type BusinessCaseType, businessCaseTypes } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';

export const BusinessCaseTypeModuleSchema = z.enum(['ADVERTISEMENT_CHANNEL']);
export type BusinessCaseTypeModule = z.infer<typeof BusinessCaseTypeModuleSchema>;

export const UpsertBusinessCaseTypeSchema = z.object({
  id: z.string().uuid().optional(),
  module: BusinessCaseTypeModuleSchema,
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().or(z.literal('')),
  isActive: z.boolean(),
});

export const SetBusinessCaseTypeActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertBusinessCaseTypeInput = z.infer<typeof UpsertBusinessCaseTypeSchema>;
export type SetBusinessCaseTypeActiveInput = z.infer<typeof SetBusinessCaseTypeActiveSchema>;

export async function fetchBusinessCaseTypes(opts: {
  module: BusinessCaseTypeModule;
  activeOnly?: boolean;
}): Promise<BusinessCaseType[]> {
  await requireInternalStaff();
  const conds = [eq(businessCaseTypes.module, opts.module)];
  if (opts.activeOnly) conds.push(eq(businessCaseTypes.isActive, true));
  return db
    .select()
    .from(businessCaseTypes)
    .where(and(...conds))
    .orderBy(asc(businessCaseTypes.name));
}

async function getById(id: string): Promise<BusinessCaseType | null> {
  const [row] = await db
    .select()
    .from(businessCaseTypes)
    .where(eq(businessCaseTypes.id, id))
    .limit(1);
  return row ?? null;
}

export async function upsertBusinessCaseType(
  input: UpsertBusinessCaseTypeInput,
): Promise<BusinessCaseType> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertBusinessCaseTypeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid catalog entry',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const description = d.description?.trim() ? d.description.trim() : null;

  return db.transaction(async (tx) => {
    if (d.id) {
      const existing = await getById(d.id);
      if (!existing) throw new BusinessRuleError('CATALOG_NOT_FOUND', 'Catalog entry not found');
      const [after] = await tx
        .update(businessCaseTypes)
        .set({
          module: d.module,
          name: d.name,
          description,
          isActive: d.isActive,
          updatedAt: sql`NOW()`,
        })
        .where(eq(businessCaseTypes.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: `business_case_type:${after.module.toLowerCase()}`,
        entityId: after.id,
        action: 'UPDATED',
        before: {
          name: existing.name,
          description: existing.description,
          isActive: existing.isActive,
        },
        after: { name: after.name, description: after.description, isActive: after.isActive },
      });
      return after;
    }
    const [created] = await tx
      .insert(businessCaseTypes)
      .values({
        module: d.module,
        name: d.name,
        description,
        isActive: d.isActive,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: `business_case_type:${created.module.toLowerCase()}`,
      entityId: created.id,
      action: 'CREATED',
      after: { module: created.module, name: created.name },
    });
    return created;
  });
}

/** Inline-create from any picker. Any internal staff. Case-insensitive dedupe. */
export async function createBusinessCaseTypeFromName(
  module: BusinessCaseTypeModule,
  name: string,
): Promise<BusinessCaseType> {
  const session = await requireInternalStaff();
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 160) {
    throw new ValidationError('Invalid name', { name: 'Name must be 2–160 characters' });
  }
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(businessCaseTypes)
      .where(and(eq(businessCaseTypes.module, module), ilike(businessCaseTypes.name, trimmed)))
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(businessCaseTypes)
      .values({
        module,
        name: trimmed,
        isActive: true,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: `business_case_type:${created.module.toLowerCase()}`,
      entityId: created.id,
      action: 'CREATED',
      after: { module: created.module, name: created.name, viaInlineCreate: true },
    });
    return created;
  });
}

export async function setBusinessCaseTypeActive(
  input: SetBusinessCaseTypeActiveInput,
): Promise<BusinessCaseType> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetBusinessCaseTypeActiveSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getById(parsed.id);
    if (!existing) throw new BusinessRuleError('CATALOG_NOT_FOUND', 'Catalog entry not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(businessCaseTypes)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(businessCaseTypes.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: `business_case_type:${after.module.toLowerCase()}`,
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}
