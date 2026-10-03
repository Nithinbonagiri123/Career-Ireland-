import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { serviceEngagements } from './commerce';
import { currencies } from './currencies';
import { persons } from './persons';
import { employers } from './recruitment';
import { users } from './users';

/**
 * ─── Phase 1: double-entry ledger foundation ──────────────────────────
 *
 * See docs/accounting-ledger-design.md for the full plan. This file is
 * **additive** — none of the existing billing / commerce / recruitment
 * tables change. The ledger shadow-records every finance event the
 * operational system emits (Phase 2) and lets admins post manual
 * balanced journals (Phase 1).
 *
 * House rules enforced here (not just at the service layer):
 *   - `journal_lines` has a deferred AFTER-trigger (defined in the SQL
 *     migration, not here) that rejects commits where sum(debit) !=
 *     sum(credit) for the parent journal.
 *   - Posted journals are immutable: a Postgres trigger (also in the
 *     migration) rejects UPDATE on rows where status='POSTED' except
 *     for the single transition to 'REVERSED' + reverses_journal_id.
 *   - `financial_events (source_system, source_event_id)` is UNIQUE so
 *     replays never produce duplicate journals.
 */

/**
 * The three operational divisions (candidate_services, recruitment,
 * immigration) plus `main` for consolidated / top-level activity.
 * Seeded; not editable from the UI in Phase 1 — the codes map 1:1 onto
 * the existing BUSINESSES constant in src/lib/auth/permissions.ts.
 */
export const businessDivisions = pgTable('business_divisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: varchar('name', { length: 80 }).notNull(),
  createdAt,
  updatedAt,
});

/**
 * One row per calendar month. Created lazily on first journal post for
 * that period. Status drives period-end close behaviour: OPEN accepts
 * postings; LOCKED rejects everything except the controlled
 * reversal/adjustment flow (Phase 4).
 */
export const accountingPeriods = pgTable(
  'accounting_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('accounting_periods_year_month_unique').on(t.year, t.month),
    check('accounting_periods_month_range', sql`${t.month} BETWEEN 1 AND 12`),
    check('accounting_periods_year_range', sql`${t.year} BETWEEN 2020 AND 2100`),
    check(
      'accounting_periods_status_check',
      sql`${t.status} IN ('OPEN','SOFT_CLOSED','CLOSED','LOCKED')`,
    ),
  ],
);

/**
 * Chart of accounts. `parent_account_id` self-refs for hierarchy
 * (e.g. a parent `Operating Expenses` grouping with per-expense children).
 * Parent accounts typically have `allow_posting = false`; the service
 * layer rejects attempts to post against them.
 *
 * `currency_code` is nullable because most GL accounts (revenue,
 * expenses) accept any currency; the exceptions are bank/cash accounts
 * which pin to a single currency.
 */
export const chartOfAccounts = pgTable(
  'chart_of_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 10 }).notNull().unique(),
    name: text('name').notNull(),
    type: varchar('type', { length: 20 }).notNull(),
    parentAccountId: uuid('parent_account_id').references(
      (): AnyPgColumn => chartOfAccounts.id,
    ),
    currencyCode: char('currency_code', { length: 3 }).references(() => currencies.code),
    taxCategory: varchar('tax_category', { length: 40 }),
    active: boolean('active').notNull().default(true),
    allowPosting: boolean('allow_posting').notNull().default(true),
    description: text('description'),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'chart_of_accounts_type_check',
      sql`${t.type} IN ('ASSET','LIABILITY','EQUITY','REVENUE','COST_OF_SALES','EXPENSE','OTHER_INCOME','OTHER_EXPENSE')`,
    ),
    index('chart_of_accounts_type_idx').on(t.type),
    index('chart_of_accounts_parent_idx').on(t.parentAccountId),
  ],
);

/**
 * Outbox + idempotency store for the ledger. Operational writes insert a
 * row here *inside their own transaction* — so a rollback of the
 * business change also rolls back the event, preventing orphan ledger
 * entries. A worker (Phase 2) drains status='RECEIVED' into journals.
 *
 * `source_event_id` is caller-supplied and typically equals the
 * originating entity's own id (e.g. an invoice uuid). The UNIQUE
 * constraint on (source_system, source_event_id) is the idempotency
 * boundary — replays return the existing journal, never a duplicate.
 */
export const financialEvents = pgTable(
  'financial_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    sourceSystem: varchar('source_system', { length: 40 }).notNull(),
    sourceModule: varchar('source_module', { length: 40 }).notNull(),
    sourceEntity: varchar('source_entity', { length: 40 }).notNull(),
    sourceId: varchar('source_id', { length: 60 }).notNull(),
    sourceEventId: varchar('source_event_id', { length: 100 }).notNull(),
    eventDate: date('event_date').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    journalId: uuid('journal_id').references((): AnyPgColumn => journals.id),
    status: varchar('status', { length: 20 }).notNull().default('RECEIVED'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('financial_events_source_unique').on(t.sourceSystem, t.sourceEventId),
    check(
      'financial_events_status_check',
      sql`${t.status} IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','MANUAL_REVIEW')`,
    ),
    index('financial_events_status_idx').on(t.status),
    index('financial_events_type_idx').on(t.eventType),
  ],
);

/**
 * The journal header. `number` is immutable, assigned via the existing
 * document_sequences table (format JRN-YYYY-NNNNNN). `source_event_id`
 * back-refs the financial_events row that produced this journal, so the
 * audit chain GL → journal → event → business entity is intrinsic.
 *
 * `reverses_journal_id` is non-null only for reversal journals. The
 * immutability trigger (in the SQL migration) allows the one UPDATE
 * that flips an original journal's status from POSTED → REVERSED when a
 * reversal is created.
 */
export const journals = pgTable(
  'journals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: varchar('number', { length: 24 }).notNull().unique(),
    journalDate: date('journal_date').notNull(),
    postingDate: date('posting_date').notNull(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => accountingPeriods.id),
    transactionCurrency: char('transaction_currency', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    functionalCurrency: char('functional_currency', { length: 3 })
      .notNull()
      .default('EUR')
      .references(() => currencies.code),
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 8 })
      .notNull()
      .default('1'),
    description: text('description').notNull(),
    sourceType: varchar('source_type', { length: 60 }),
    sourceEventId: uuid('source_event_id').references(() => financialEvents.id),
    status: varchar('status', { length: 20 }).notNull().default('DRAFT'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    postedByUserId: uuid('posted_by_user_id').references(() => users.id),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    reversesJournalId: uuid('reverses_journal_id').references((): AnyPgColumn => journals.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'journals_status_check',
      sql`${t.status} IN ('DRAFT','PENDING_APPROVAL','POSTED','REVERSED','VOID')`,
    ),
    index('journals_period_idx').on(t.periodId),
    index('journals_status_idx').on(t.status),
    index('journals_source_event_idx').on(t.sourceEventId),
    index('journals_posting_date_idx').on(t.postingDate),
  ],
);

/**
 * The journal detail. Every line is either a debit or a credit (never
 * both) — enforced by the XOR check. The parent journal must balance,
 * which is checked by a deferred AFTER-trigger (SQL migration).
 *
 * Dimensions carried per line so a single query can slice revenue by
 * division/customer/service without joining through the journal header.
 */
export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journals.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    divisionId: uuid('division_id').references(() => businessDivisions.id),
    debit: numeric('debit', { precision: 14, scale: 2 }).notNull().default('0'),
    credit: numeric('credit', { precision: 14, scale: 2 }).notNull().default('0'),
    foreignDebit: numeric('foreign_debit', { precision: 14, scale: 2 }).notNull().default('0'),
    foreignCredit: numeric('foreign_credit', { precision: 14, scale: 2 }).notNull().default('0'),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    customerPersonId: uuid('customer_person_id').references(() => persons.id),
    customerEmployerId: uuid('customer_employer_id').references(() => employers.id),
    serviceEngagementId: uuid('service_engagement_id').references(() => serviceEngagements.id),
    taxCode: varchar('tax_code', { length: 40 }),
    description: text('description'),
    createdAt,
  },
  (t) => [
    unique('journal_lines_journal_line_unique').on(t.journalId, t.lineNumber),
    check(
      'journal_lines_debit_credit_nonneg',
      sql`${t.debit} >= 0 AND ${t.credit} >= 0`,
    ),
    check(
      'journal_lines_debit_xor_credit',
      sql`(${t.debit} = 0) <> (${t.credit} = 0)`,
    ),
    index('journal_lines_account_idx').on(t.accountId),
    index('journal_lines_division_idx').on(t.divisionId),
    index('journal_lines_customer_person_idx').on(t.customerPersonId),
    index('journal_lines_customer_employer_idx').on(t.customerEmployerId),
  ],
);

/**
 * The accounting-rule engine's lookup table. For a given event_type +
 * division + currency + line_role tuple, this tells the worker which
 * accounts to hit. Priority breaks ties when multiple rules match.
 *
 * Seeded for Phase 2 events (INVOICE_POSTED, PAYMENT_RECEIVED,
 * CREDIT_NOTE_POSTED). The admin UI to edit rules is Phase 4.
 */
export const accountingRules = pgTable(
  'accounting_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    divisionCode: varchar('division_code', { length: 40 }),
    currencyCode: char('currency_code', { length: 3 }),
    conditionJson: jsonb('condition_json').$type<Record<string, unknown>>(),
    debitAccountCode: varchar('debit_account_code', { length: 10 }).notNull(),
    creditAccountCode: varchar('credit_account_code', { length: 10 }).notNull(),
    lineRole: varchar('line_role', { length: 20 }).notNull(),
    priority: integer('priority').notNull().default(100),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('accounting_rules_key_unique').on(
      t.eventType,
      t.divisionCode,
      t.currencyCode,
      t.lineRole,
      t.effectiveFrom,
    ),
    check(
      'accounting_rules_line_role_check',
      sql`${t.lineRole} IN ('PRINCIPAL','TAX','FEE','DISCOUNT')`,
    ),
    index('accounting_rules_event_idx').on(t.eventType),
  ],
);

export type BusinessDivision = typeof businessDivisions.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type ChartOfAccountsRow = typeof chartOfAccounts.$inferSelect;
export type FinancialEvent = typeof financialEvents.$inferSelect;
export type Journal = typeof journals.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type AccountingRule = typeof accountingRules.$inferSelect;
