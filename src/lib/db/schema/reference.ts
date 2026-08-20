import { boolean, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';

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

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type Qualification = typeof qualifications.$inferSelect;
export type NewQualification = typeof qualifications.$inferInsert;
export type DocumentType = typeof documentTypes.$inferSelect;
export type NewDocumentType = typeof documentTypes.$inferInsert;
