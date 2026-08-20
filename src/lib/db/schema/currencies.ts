import { boolean, char, pgTable, varchar } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';

/**
 * ISO 4217 currency reference. Every money field elsewhere references
 * currencies.code (CHAR(3)) — never a free-form currency string.
 */
export const currencies = pgTable('currencies', {
  code: char('code', { length: 3 }).primaryKey(),
  name: varchar('name', { length: 60 }).notNull(),
  symbol: varchar('symbol', { length: 5 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
});

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
