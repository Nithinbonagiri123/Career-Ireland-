import { boolean, char, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';

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
