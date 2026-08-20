import { asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import {
  type NewOccupation,
  type NewOccupationCategory,
  type Occupation,
  type OccupationCategory,
  occupationCategories,
  occupations,
} from '@/lib/db/schema/occupations';

export type CategoryWithCount = OccupationCategory & { occupationCount: number };

export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      id: occupationCategories.id,
      name: occupationCategories.name,
      isActive: occupationCategories.isActive,
      createdAt: occupationCategories.createdAt,
      updatedAt: occupationCategories.updatedAt,
      occupationCount: sql<number>`COUNT(${occupations.id})::int`,
    })
    .from(occupationCategories)
    .leftJoin(occupations, eq(occupations.categoryId, occupationCategories.id))
    .groupBy(occupationCategories.id)
    .orderBy(asc(occupationCategories.name));
  return rows;
}

export async function listOccupations(): Promise<Array<Occupation & { categoryName: string }>> {
  return db
    .select({
      id: occupations.id,
      categoryId: occupations.categoryId,
      name: occupations.name,
      isActive: occupations.isActive,
      createdAt: occupations.createdAt,
      updatedAt: occupations.updatedAt,
      categoryName: occupationCategories.name,
    })
    .from(occupations)
    .innerJoin(occupationCategories, eq(occupationCategories.id, occupations.categoryId))
    .orderBy(asc(occupationCategories.name), asc(occupations.name));
}

export async function getCategory(id: string): Promise<OccupationCategory | null> {
  const [row] = await db
    .select()
    .from(occupationCategories)
    .where(eq(occupationCategories.id, id))
    .limit(1);
  return row ?? null;
}

export async function insertCategory(
  tx: DbExecutor,
  data: NewOccupationCategory,
): Promise<OccupationCategory> {
  const [row] = await tx.insert(occupationCategories).values(data).returning();
  if (!row) throw new Error('occupation_categories insert returned no row');
  return row;
}

export async function updateCategory(
  tx: DbExecutor,
  id: string,
  patch: Partial<Pick<OccupationCategory, 'name' | 'isActive'>>,
): Promise<OccupationCategory> {
  const [row] = await tx
    .update(occupationCategories)
    .set({ ...patch, updatedAt: sql`NOW()` })
    .where(eq(occupationCategories.id, id))
    .returning();
  if (!row) throw new Error(`occupation_category ${id} not found`);
  return row;
}

export async function getOccupation(id: string): Promise<Occupation | null> {
  const [row] = await db.select().from(occupations).where(eq(occupations.id, id)).limit(1);
  return row ?? null;
}

export async function insertOccupation(tx: DbExecutor, data: NewOccupation): Promise<Occupation> {
  const [row] = await tx.insert(occupations).values(data).returning();
  if (!row) throw new Error('occupations insert returned no row');
  return row;
}

export async function updateOccupation(
  tx: DbExecutor,
  id: string,
  patch: Partial<Pick<Occupation, 'name' | 'categoryId' | 'isActive'>>,
): Promise<Occupation> {
  const [row] = await tx
    .update(occupations)
    .set({ ...patch, updatedAt: sql`NOW()` })
    .where(eq(occupations.id, id))
    .returning();
  if (!row) throw new Error(`occupation ${id} not found`);
  return row;
}
