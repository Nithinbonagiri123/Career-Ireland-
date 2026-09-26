import { boolean, index, pgTable, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { users } from './users';

/** Controlled skill vocabulary (e.g. "Forklift certified", "MIG welding"). */
export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

/** Controlled qualification vocabulary (e.g. "HGV Class 1", "City & Guilds Level 3 Plumbing"). */
export const qualifications = pgTable('qualifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

/** Configurable document types. `code` is a stable machine identifier used by requirement rules. */
export const documentTypes = pgTable('document_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  hasExpiry: boolean('has_expiry').notNull().default(false),
  appliesTo: text('applies_to', { enum: ['PERSON', 'EMPLOYER', 'BOTH'] })
    .notNull()
    .default('PERSON'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

/**
 * Generic, module-agnostic catalog of sub-types staff can add themselves.
 * Same shape as immigration_application_types (kept as-is for that module),
 * but with a `module` discriminator so a single admin CRUD component + a
 * single picker can serve every future module.
 *
 * Currently used by:
 *   - `ADVERTISEMENT_CHANNEL` — LinkedIn, IrishJobs, Indeed, custom sources.
 *
 * Not used for immigration (which keeps its own table for the category enum
 * that ties it to the immigration case_type). If we ever want strict one-
 * table consolidation, migrating immigration_application_types into this
 * table is a mechanical change — same column shape.
 */
export const businessCaseTypes = pgTable(
  'business_case_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Which business area this catalog entry belongs to. */
    module: text('module', {
      enum: ['ADVERTISEMENT_CHANNEL'],
    }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('business_case_types_module_name_unique').on(t.module, t.name),
    index('business_case_types_module_idx').on(t.module),
    index('business_case_types_active_idx').on(t.isActive),
  ],
);

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type Qualification = typeof qualifications.$inferSelect;
export type NewQualification = typeof qualifications.$inferInsert;
export type DocumentType = typeof documentTypes.$inferSelect;
export type NewDocumentType = typeof documentTypes.$inferInsert;
export type BusinessCaseType = typeof businessCaseTypes.$inferSelect;
export type NewBusinessCaseType = typeof businessCaseTypes.$inferInsert;
