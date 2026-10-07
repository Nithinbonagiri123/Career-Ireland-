import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';
import { users } from './users';

/**
 * ─── Phase 7: Accounts Payable (supplier bills + bill payments) ──────
 *
 * The purchase-side mirror of invoices/payments. A supplier bill is
 * what we owe a vendor; a bill payment is us settling it. Journals
 * follow the standard AP shape:
 *
 *   On bill post:  DR Expense (per bill.expense_account_code)
 *                  DR VAT Recoverable (1050) if tax > 0
 *                      CR 2000 Accounts Payable
 *
 *   On payment:    DR 2000 Accounts Payable
 *                      CR 1010 Bank
 *
 * Numbering mirrors the invoices side via `document_sequences` with the
 * `BILL` prefix so there's one atomic sequence allocator for every
 * numbered document in the app.
 */

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    tradingName: varchar('trading_name', { length: 200 }),
    email: varchar('email', { length: 200 }),
    phone: varchar('phone', { length: 50 }),
    address: text('address'),
    taxNumber: varchar('tax_number', { length: 50 }),
    country: char('country', { length: 2 }),
    currencyCode: char('currency_code', { length: 3 }).references(() => currencies.code),
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('suppliers_name_idx').on(t.legalName),
    index('suppliers_active_idx').on(t.isActive),
  ],
);

export const supplierBills = pgTable(
  'supplier_bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 24 }).notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    supplierReference: varchar('supplier_reference', { length: 100 }),
    billDate: date('bill_date').notNull(),
    dueDate: date('due_date').notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    expenseAccountCode: varchar('expense_account_code', { length: 10 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('POSTED'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'supplier_bills_status_check',
      sql`${t.status} IN ('DRAFT','POSTED','PARTIALLY_PAID','PAID','VOID')`,
    ),
    check('supplier_bills_amount_check', sql`${t.subtotal} >= 0 AND ${t.totalAmount} >= 0`),
    check(
      'supplier_bills_total_math',
      sql`ROUND(${t.subtotal}::numeric + ${t.taxAmount}::numeric, 2) = ROUND(${t.totalAmount}::numeric, 2)`,
    ),
    index('supplier_bills_supplier_idx').on(t.supplierId),
    index('supplier_bills_status_idx').on(t.status),
    index('supplier_bills_due_date_idx').on(t.dueDate),
  ],
);

export const billPayments = pgTable(
  'bill_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => supplierBills.id),
    paymentDate: date('payment_date').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    method: varchar('method', { length: 40 }).notNull().default('BANK_TRANSFER'),
    reference: text('reference'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    check('bill_payments_amount_positive', sql`${t.amount} > 0`),
    check(
      'bill_payments_method_check',
      sql`${t.method} IN ('BANK_TRANSFER','CARD','CASH','DIRECT_DEBIT','CHEQUE','OTHER')`,
    ),
    index('bill_payments_bill_idx').on(t.billId),
    index('bill_payments_date_idx').on(t.paymentDate),
  ],
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type SupplierBill = typeof supplierBills.$inferSelect;
export type NewSupplierBill = typeof supplierBills.$inferInsert;
export type BillPayment = typeof billPayments.$inferSelect;
export type NewBillPayment = typeof billPayments.$inferInsert;
