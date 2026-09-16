import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { payments, serviceEngagements } from './commerce';
import { currencies } from './currencies';
import { persons } from './persons';
import { employers } from './recruitment';
import { users } from './users';

/**
 * Per-year sequence table for immutable document numbers (invoices, receipts).
 * We SELECT ... FOR UPDATE the row inside the create-invoice / create-receipt
 * transaction so two concurrent creates can't collide on the same number.
 *
 * Format: `${prefix}-${year}-${paddedValue}` e.g. `INV-2026-000123`.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prefix: varchar('prefix', { length: 8 }).notNull(),
    year: integer('year').notNull(),
    currentValue: integer('current_value').notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('document_sequences_prefix_year_unique').on(t.prefix, t.year),
    check('document_sequences_year_check', sql`${t.year} BETWEEN 2020 AND 2100`),
    check('document_sequences_value_check', sql`${t.currentValue} >= 0`),
  ],
);

export type DocumentSequence = typeof documentSequences.$inferSelect;

/**
 * Invoice — the demand for payment issued to a payer. Immutable once issued:
 * mistakes are corrected by issuing a credit note, never by editing the row.
 * Payer is exactly one of `payer_person_id` (candidate flow, lead → invoice)
 * or `payer_employer_id` (employer detail page → invoice). Enforced by the
 * `invoices_payer_xor` CHECK below.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable, immutable, unique. Format `INV-YYYY-NNNNNN`. */
    number: varchar('number', { length: 24 }).notNull().unique(),
    payerPersonId: uuid('payer_person_id').references(() => persons.id),
    payerEmployerId: uuid('payer_employer_id').references(() => employers.id),
    serviceEngagementId: uuid('service_engagement_id')
      .notNull()
      .references(() => serviceEngagements.id),
    /**
     * Line quantity — the ICG invoice template exposes a QTY column
     * alongside Unit Price. Defaults to 1 so single-service invoices
     * feel natural (owner may sell "3 x Info Session" or similar).
     */
    qty: integer('qty').notNull().default(1),
    /** Per-unit price. Subtotal = qty × unit_price by construction. */
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    lineDescription: text('line_description').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['ISSUED', 'PAID', 'VOIDED'] })
      .notNull()
      .default('ISSUED'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedByUserId: uuid('voided_by_user_id').references(() => users.id),
    voidReason: text('void_reason'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('invoices_payer_person_idx').on(t.payerPersonId),
    index('invoices_payer_employer_idx').on(t.payerEmployerId),
    index('invoices_engagement_idx').on(t.serviceEngagementId),
    index('invoices_status_idx').on(t.status),
    check('invoices_totals_positive', sql`${t.totalAmount} >= 0 AND ${t.subtotal} >= 0`),
    check('invoices_totals_add_up', sql`${t.totalAmount} = ${t.subtotal} + ${t.taxAmount}`),
    check('invoices_qty_positive', sql`${t.qty} > 0`),
    check(
      'invoices_subtotal_matches_qty_times_unit_price',
      sql`${t.subtotal} = ${t.qty} * ${t.unitPrice}`,
    ),
    // Exactly one payer type — mirrors the service_engagements_payer_xor
    // pattern so the row can't be ambiguous.
    check(
      'invoices_payer_xor',
      sql`(${t.payerPersonId} IS NOT NULL) <> (${t.payerEmployerId} IS NOT NULL)`,
    ),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

/**
 * Receipt — proof that a payment was received. One receipt per settled
 * payment. `RCT-YYYY-NNNNNN`. Also immutable once issued.
 */
export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 24 }).notNull().unique(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id)
      .unique(),
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    payerPersonId: uuid('payer_person_id').references(() => persons.id),
    payerEmployerId: uuid('payer_employer_id').references(() => employers.id),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('receipts_payer_person_idx').on(t.payerPersonId),
    index('receipts_payer_employer_idx').on(t.payerEmployerId),
    index('receipts_invoice_idx').on(t.invoiceId),
    check('receipts_amount_positive', sql`${t.amount} > 0`),
    check(
      'receipts_payer_xor',
      sql`(${t.payerPersonId} IS NOT NULL) <> (${t.payerEmployerId} IS NOT NULL)`,
    ),
  ],
);

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
