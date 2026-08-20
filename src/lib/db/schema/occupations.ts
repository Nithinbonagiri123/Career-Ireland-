import { boolean, pgTable, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';

export const occupationCategories = pgTable('occupation_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

export const occupations = pgTable(
  'occupations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => occupationCategories.id),
    name: varchar('name', { length: 120 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [unique('occupations_category_name_unique').on(t.categoryId, t.name)],
);

export type OccupationCategory = typeof occupationCategories.$inferSelect;
export type NewOccupationCategory = typeof occupationCategories.$inferInsert;
export type Occupation = typeof occupations.$inferSelect;
export type NewOccupation = typeof occupations.$inferInsert;
