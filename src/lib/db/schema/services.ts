import {
  boolean,
  char,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';

/**
 * Session 34 — user-editable business-line tags. Owners add rows for
 * each line of business (Candidate services, Recruitment, Immigration,
 * …) so services can be grouped and filtered without a schema change.
 * Adding a new business line is a one-row insert from the admin UI —
 * no code change needed.
 */
export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short, stable, lower-kebab-case key used for programmatic refs. */
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    /** Human-readable label shown in dropdowns and the admin table. */
    name: varchar('name', { length: 120 }).notNull(),
    /** Optional one-liner explaining when to use this category. */
    description: text('description'),
    /** Lower = appears first. Ties broken alphabetically by name. */
    displayOrder: integer('display_order').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [index('service_categories_active_order_idx').on(t.isActive, t.displayOrder)],
);

/** Configurable service offerings (Job Search, Employment Permit, Visa, Visa Extension…). */
export const serviceCatalogItems = pgTable('service_catalog_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  defaultCurrencyCode: char('default_currency_code', { length: 3 }).references(
    () => currencies.code,
  ),
  defaultPrice: numeric('default_price', { precision: 14, scale: 2 }),
  payerType: text('payer_type', { enum: ['PERSON', 'EMPLOYER', 'ANY'] })
    .notNull()
    .default('PERSON'),
  /**
   * Session 34 — optional business-line tag. NULL = uncategorised
   * (shows in every context). FK is ON DELETE SET NULL at the SQL
   * layer so deactivating a category doesn't orphan its services.
   */
  categoryId: uuid('category_id').references(() => serviceCategories.id, {
    onDelete: 'set null',
  }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

/** Bundled pricing packages (Basic / Standard / Premium) tied to a specific service. */
export const servicePackages = pgTable('service_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  serviceCatalogItemId: uuid('service_catalog_item_id')
    .notNull()
    .references(() => serviceCatalogItems.id),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  currencyCode: char('currency_code', { length: 3 })
    .notNull()
    .references(() => currencies.code),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

export type ServiceCatalogItem = typeof serviceCatalogItems.$inferSelect;
export type NewServiceCatalogItem = typeof serviceCatalogItems.$inferInsert;
export type ServicePackage = typeof servicePackages.$inferSelect;
export type NewServicePackage = typeof servicePackages.$inferInsert;
export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type NewServiceCategory = typeof serviceCategories.$inferInsert;
