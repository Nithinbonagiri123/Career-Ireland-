import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import type { Occupation, OccupationCategory } from '@/lib/db/schema/occupations';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type CategoryWithCount,
  getCategory,
  getOccupation,
  insertCategory,
  insertOccupation,
  listCategoriesWithCounts,
  listOccupations,
  updateCategory,
  updateOccupation,
} from './repository';
import {
  type SetActiveByIdInput,
  SetActiveByIdSchema,
  type UpsertCategoryInput,
  UpsertCategorySchema,
  type UpsertOccupationInput,
  UpsertOccupationSchema,
} from './schemas';

export async function fetchCategories(): Promise<CategoryWithCount[]> {
  await requireInternalStaff();
  return listCategoriesWithCounts();
}

export async function fetchOccupations() {
  await requireInternalStaff();
  return listOccupations();
}

export async function upsertCategory(input: UpsertCategoryInput): Promise<OccupationCategory> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertCategorySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid category',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    if (data.id) {
      const existing = await getCategory(data.id);
      if (!existing) throw new BusinessRuleError('CATEGORY_NOT_FOUND', 'Category not found');
      if (existing.name === data.name && existing.isActive === data.isActive) return existing;
      const after = await updateCategory(tx, data.id, { name: data.name, isActive: data.isActive });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'occupation_category',
        entityId: after.id,
        action: 'UPDATED',
        before: { name: existing.name, isActive: existing.isActive },
        after: { name: after.name, isActive: after.isActive },
      });
      return after;
    }
    const created = await insertCategory(tx, { name: data.name, isActive: data.isActive });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'occupation_category',
      entityId: created.id,
      action: 'CREATED',
      after: { name: created.name },
    });
    return created;
  });
}

export async function setCategoryActive(input: SetActiveByIdInput): Promise<OccupationCategory> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getCategory(parsed.id);
    if (!existing) throw new BusinessRuleError('CATEGORY_NOT_FOUND', 'Category not found');
    if (existing.isActive === parsed.isActive) return existing;
    const after = await updateCategory(tx, parsed.id, { isActive: parsed.isActive });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'occupation_category',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}

export async function upsertOccupation(input: UpsertOccupationInput): Promise<Occupation> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertOccupationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid occupation',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    if (data.id) {
      const existing = await getOccupation(data.id);
      if (!existing) throw new BusinessRuleError('OCCUPATION_NOT_FOUND', 'Occupation not found');
      if (
        existing.name === data.name &&
        existing.categoryId === data.categoryId &&
        existing.isActive === data.isActive
      ) {
        return existing;
      }
      const after = await updateOccupation(tx, data.id, {
        name: data.name,
        categoryId: data.categoryId,
        isActive: data.isActive,
      });
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'occupation',
        entityId: after.id,
        action: 'UPDATED',
        before: {
          name: existing.name,
          categoryId: existing.categoryId,
          isActive: existing.isActive,
        },
        after: { name: after.name, categoryId: after.categoryId, isActive: after.isActive },
      });
      return after;
    }
    const created = await insertOccupation(tx, {
      name: data.name,
      categoryId: data.categoryId,
      isActive: data.isActive,
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'occupation',
      entityId: created.id,
      action: 'CREATED',
      after: { name: created.name, categoryId: created.categoryId },
    });
    return created;
  });
}

export async function setOccupationActive(input: SetActiveByIdInput): Promise<Occupation> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getOccupation(parsed.id);
    if (!existing) throw new BusinessRuleError('OCCUPATION_NOT_FOUND', 'Occupation not found');
    if (existing.isActive === parsed.isActive) return existing;
    const after = await updateOccupation(tx, parsed.id, { isActive: parsed.isActive });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'occupation',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}
