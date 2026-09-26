/**
 * Immigration Application Type — reusable catalog. Same shape as skills /
 * qualifications: fetchAll, upsert (admin), createFromName (inline "+ New"
 * on the case dialog for any staff), setActive (admin).
 *
 * Category slots the type under the top-level immigration_cases.case_type
 * enum so reporting on "all Employment Permit cases" still works with a
 * single WHERE clause, without joining the catalog table.
 */
import { and, asc, eq, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type ImmigrationApplicationType,
  immigrationApplicationTypes,
} from '@/lib/db/schema/immigration';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { CaseTypeSchema } from './schemas';

// ─── Schemas ────────────────────────────────────────────────────────────────

export const UpsertApplicationTypeSchema = z.object({
  id: z.string().uuid().optional(),
  category: CaseTypeSchema,
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().or(z.literal('')),
  isActive: z.boolean(),
});

export const SetApplicationTypeActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertApplicationTypeInput = z.infer<typeof UpsertApplicationTypeSchema>;
export type SetApplicationTypeActiveInput = z.infer<typeof SetApplicationTypeActiveSchema>;

// ─── Service ────────────────────────────────────────────────────────────────

export async function fetchApplicationTypes(opts?: {
  activeOnly?: boolean;
  category?: 'EMPLOYMENT_PERMIT' | 'VISA' | 'VISA_EXTENSION';
}): Promise<ImmigrationApplicationType[]> {
  await requireInternalStaff();
  const conds = [] as ReturnType<typeof eq>[];
  if (opts?.activeOnly) conds.push(eq(immigrationApplicationTypes.isActive, true));
  if (opts?.category) conds.push(eq(immigrationApplicationTypes.category, opts.category));
  return db
    .select()
    .from(immigrationApplicationTypes)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(asc(immigrationApplicationTypes.name));
}

async function getById(id: string): Promise<ImmigrationApplicationType | null> {
  const [row] = await db
    .select()
    .from(immigrationApplicationTypes)
    .where(eq(immigrationApplicationTypes.id, id))
    .limit(1);
  return row ?? null;
}

export async function upsertApplicationType(
  input: UpsertApplicationTypeInput,
): Promise<ImmigrationApplicationType> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertApplicationTypeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid application type',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const description = d.description?.trim() ? d.description.trim() : null;

  return db.transaction(async (tx) => {
    if (d.id) {
      const existing = await getById(d.id);
      if (!existing)
        throw new BusinessRuleError('APP_TYPE_NOT_FOUND', 'Application type not found');
      const [after] = await tx
        .update(immigrationApplicationTypes)
        .set({
          category: d.category,
          name: d.name,
          description,
          isActive: d.isActive,
          updatedAt: sql`NOW()`,
        })
        .where(eq(immigrationApplicationTypes.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'immigration_application_type',
        entityId: after.id,
        action: 'UPDATED',
        before: {
          category: existing.category,
          name: existing.name,
          description: existing.description,
          isActive: existing.isActive,
        },
        after: {
          category: after.category,
          name: after.name,
          description: after.description,
          isActive: after.isActive,
        },
      });
      return after;
    }
    const [created] = await tx
      .insert(immigrationApplicationTypes)
      .values({
        category: d.category,
        name: d.name,
        description,
        isActive: d.isActive,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_application_type',
      entityId: created.id,
      action: 'CREATED',
      after: { category: created.category, name: created.name },
    });
    return created;
  });
}

/**
 * Inline-create from the case dialog. Any internal staff can add a new
 * application type without waiting on an admin — mirrors the skills /
 * qualifications inline-create UX. Case-insensitive dedupe so re-typing
 * an existing name returns that row instead of erroring.
 */
export async function createApplicationTypeFromName(
  category: 'EMPLOYMENT_PERMIT' | 'VISA' | 'VISA_EXTENSION',
  name: string,
): Promise<ImmigrationApplicationType> {
  const session = await requireInternalStaff();
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 160) {
    throw new ValidationError('Invalid application type name', {
      name: 'Name must be 2–160 characters',
    });
  }
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(immigrationApplicationTypes)
      .where(ilike(immigrationApplicationTypes.name, trimmed))
      .limit(1);
    if (existing) return existing;
    const [created] = await tx
      .insert(immigrationApplicationTypes)
      .values({
        category,
        name: trimmed,
        isActive: true,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_application_type',
      entityId: created.id,
      action: 'CREATED',
      after: { category: created.category, name: created.name, viaInlineCreate: true },
    });
    return created;
  });
}

export async function setApplicationTypeActive(
  input: SetApplicationTypeActiveInput,
): Promise<ImmigrationApplicationType> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetApplicationTypeActiveSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getById(parsed.id);
    if (!existing) throw new BusinessRuleError('APP_TYPE_NOT_FOUND', 'Application type not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(immigrationApplicationTypes)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(immigrationApplicationTypes.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'immigration_application_type',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}
