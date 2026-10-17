import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { invoices } from './billing';
import { currencies } from './currencies';
import { leads } from './leads';
import { persons } from './persons';
import { serviceCatalogItems } from './services';
import { users } from './users';

/**
 * Pro-forma invoices for the Candidate Services workflow.
 *
 * ── Why a separate table (not just a `kind` column on invoices) ──────
 * `invoices` is **immutable + sequential + feeds the accounting ledger
 * and VAT return**. Pro formas are editable, often rejected, and must
 * never consume an INV number. Keeping them in a separate table:
 *
 *   - Preserves the invoices-are-immutable invariant (no downstream
 *     reader needs a `WHERE kind = 'OFFICIAL'` clause).
 *   - Keeps receipts / credit notes / refunds — which FK to invoices —
 *     cleanly scoped to issued official documents.
 *   - Lets pro-forma numbering live on an independent `PROF` sequence
 *     in document_sequences (same mechanism, different prefix).
 *
 * ── Lifecycle ───────────────────────────────────────────────────────
 *   DRAFT     — operator still composing; editable; not shown to client
 *   ISSUED    — sent to client; still editable (bumps revision)
 *   ACCEPTED  — client (or admin on their behalf) accepted this offer
 *   REJECTED  — operator or client rejected; terminal
 *   CANCELLED — withdrawn before any decision; terminal
 *   CONVERTED — full verified payment received; linked to one or more
 *               official invoices via pro_forma_official_invoices
 *
 * ── Multi-document relationship ─────────────────────────────────────
 * A single pro forma may legitimately spawn more than one official
 * invoice (e.g. milestone billing). Modelled via a join table so the
 * one-to-many case is first-class, not a schema workaround.
 */

export const proposalGroups = pgTable(
  'proposal_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    /** Free-text internal note explaining why multiple proformas were
     *  issued for the same lead (e.g. "offered 3 tiers at the client's
     *  request"). Audit log captures changes; this is the current value. */
    notes: text('notes'),
    /** Set when one proforma in the group is accepted. Siblings auto-
     *  flip to REJECTED. Nullable until a decision is made. */
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [index('proposal_groups_lead_idx').on(t.leadId)],
);

export type ProposalGroup = typeof proposalGroups.$inferSelect;
export type NewProposalGroup = typeof proposalGroups.$inferInsert;

export const proFormaInvoices = pgTable(
  'pro_forma_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable, unique. `PROF-YYYY-NNNNNN`. Allocated via the
     *  shared `document_sequences` locking mechanism with prefix PROF. */
    number: varchar('number', { length: 24 }).notNull().unique(),
    /** Nullable: a standalone proforma (no competing offers) has no group. */
    proposalGroupId: uuid('proposal_group_id').references(() => proposalGroups.id),
    sourceLeadId: uuid('source_lead_id')
      .notNull()
      .references(() => leads.id),
    /** CS payer is always a person (per blueprint). If future business
     *  lines use pro formas, add payer_employer_id + XOR check. */
    payerPersonId: uuid('payer_person_id')
      .notNull()
      .references(() => persons.id),
    currencyCode: text('currency_code')
      .notNull()
      .references(() => currencies.code),
    /** Document total — computed from line items (sum of line_subtotal).
     *  Snapshotted on the row for cheap list queries + a tripwire if the
     *  line items drift. */
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Lifecycle status. Stage 2 adds SUPERSEDED — set when a sibling pro
     *  forma in the same proposal group is accepted, so the losing offers
     *  are preserved for the record rather than destroyed. Enforced at the
     *  DB layer by a CHECK below. */
    status: text('status', {
      enum: ['DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'CONVERTED', 'SUPERSEDED'],
    })
      .notNull()
      .default('DRAFT'),
    /** Increments on every edit after the first ISSUED transition.
     *  Lets operators and clients see which draft they're on. */
    revision: integer('revision').notNull().default(1),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedByUserId: uuid('rejected_by_user_id').references(() => users.id),
    rejectedReason: text('rejected_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByUserId: uuid('cancelled_by_user_id').references(() => users.id),
    notes: text('notes'),
    /** Optional operator-set payment terms copy ("50% deposit then
     *  monthly instalments", "net 14 days", etc.). Rendered on the PDF
     *  under the totals. Nullable — if blank, the printable omits the
     *  payment-terms section. */
    paymentTerms: text('payment_terms'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('pro_forma_invoices_source_lead_idx').on(t.sourceLeadId),
    index('pro_forma_invoices_group_idx').on(t.proposalGroupId),
    index('pro_forma_invoices_status_idx').on(t.status),
    index('pro_forma_invoices_payer_person_idx').on(t.payerPersonId),
    check('pro_forma_invoices_subtotal_nonneg', sql`${t.subtotal} >= 0`),
    check('pro_forma_invoices_revision_pos', sql`${t.revision} >= 1`),
    // Defence-in-depth over the Drizzle TS enum — stops ad-hoc SQL from
    // writing unknown status values. Keep this list in sync with the
    // Drizzle enum declaration above.
    check(
      'pro_forma_invoices_status_check',
      sql`${t.status} IN ('DRAFT','ISSUED','ACCEPTED','REJECTED','CANCELLED','CONVERTED','SUPERSEDED')`,
    ),
    // At most one ACCEPTED pro forma per proposal group. Partial unique
    // index — rows outside the ACCEPTED state are ignored, so DRAFT /
    // ISSUED / SUPERSEDED siblings coexist freely. This is the DB-level
    // backstop; the service also takes `SELECT ... FOR UPDATE` on the
    // group row before writing, which serialises concurrent accepts.
    uniqueIndex('pro_forma_invoices_one_accepted_per_group')
      .on(t.proposalGroupId)
      .where(sql`${t.status} = 'ACCEPTED'`),
  ],
);

export type ProFormaInvoice = typeof proFormaInvoices.$inferSelect;
export type NewProFormaInvoice = typeof proFormaInvoices.$inferInsert;
export type ProFormaInvoiceStatus = ProFormaInvoice['status'];

export const proFormaLineItems = pgTable(
  'pro_forma_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proFormaInvoiceId: uuid('pro_forma_invoice_id')
      .notNull()
      .references(() => proFormaInvoices.id, { onDelete: 'cascade' }),
    serviceCatalogItemId: uuid('service_catalog_item_id')
      .notNull()
      .references(() => serviceCatalogItems.id),
    /** Operator-editable description; defaults to the service name on
     *  creation but can be overridden to spell out scope / deliverables. */
    description: text('description').notNull(),
    /** Allow fractional units (0.5 hour, 1.5 day packages). */
    quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    /** quantity × unit_price, stored for cheap list queries. The service
     *  layer computes this on insert/update — DB-side is a tripwire. */
    lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
    /** Order within the pro forma, 0-indexed. */
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('pro_forma_line_items_proforma_idx').on(t.proFormaInvoiceId),
    index('pro_forma_line_items_service_idx').on(t.serviceCatalogItemId),
    check('pro_forma_line_items_quantity_pos', sql`${t.quantity} > 0`),
    check('pro_forma_line_items_unit_price_nonneg', sql`${t.unitPrice} >= 0`),
    check('pro_forma_line_items_line_subtotal_nonneg', sql`${t.lineSubtotal} >= 0`),
  ],
);

export type ProFormaLineItem = typeof proFormaLineItems.$inferSelect;
export type NewProFormaLineItem = typeof proFormaLineItems.$inferInsert;

/**
 * Many-to-many between a pro forma and the official invoice(s) it spawned.
 *
 * ── Why a join table, not `pro_forma_invoices.converted_invoice_id` ─
 * A single accepted pro forma may legitimately produce >1 official
 * invoice (milestone billing, split shipments). A FK on the pro forma
 * would force 1:1 and quietly block that case. Modelling it as a join
 * table makes the N-to-M case first-class.
 *
 * ── Duplicate-issuance protection (Stage 2) ──────────────────────────
 * Stage 1's `UNIQUE(pro_forma_invoice_id, invoice_id)` only stopped the
 * same (pro_forma, invoice) pair appearing twice — it did NOT stop two
 * different invoices being issued against one pro forma for the same
 * logical reason. Stage 2 introduces an explicit *purpose* + an
 * *issuance key* and uniqueness on `(pro_forma_invoice_id, purpose,
 * issuance_key)`:
 *
 *   purpose       issuance_key   meaning
 *   -----------   ------------   ------------------------------------
 *   FULL_PAYMENT  'full'         single invoice covering the whole PF
 *   DEPOSIT       'deposit'      initial deposit against the PF
 *   BALANCE       'balance'      final balance after deposits
 *   MILESTONE     'm-1', 'm-2'   milestone N of the PF
 *   AMENDMENT     'amd-<slug>'   amendment adding scope to an accepted PF
 *
 * So "there can only be one FULL_PAYMENT invoice per pro forma" and
 * "there can only be one DEPOSIT invoice per pro forma" are enforced at
 * the DB level, while legitimate multi-document cases (milestone
 * billing, amendments) remain expressible with distinct keys.
 *
 * The Stage 3 issuance service must additionally:
 *   - take SELECT ... FOR UPDATE on the pro forma row before writing
 *   - treat an existing row for `(pro_forma_invoice_id, purpose,
 *     issuance_key)` as the idempotency source of truth and return it
 *     rather than throwing.
 */
export const proFormaOfficialInvoices = pgTable(
  'pro_forma_official_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proFormaInvoiceId: uuid('pro_forma_invoice_id')
      .notNull()
      .references(() => proFormaInvoices.id),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    /** What this invoice represents against the pro forma. See the
     *  table-level docstring for the semantics of each value. */
    purpose: text('purpose', {
      enum: ['FULL_PAYMENT', 'DEPOSIT', 'BALANCE', 'MILESTONE', 'AMENDMENT'],
    })
      .notNull()
      .default('FULL_PAYMENT'),
    /** Idempotency key within the (pro_forma, purpose) scope. For
     *  singletons (FULL_PAYMENT, DEPOSIT, BALANCE) the convention is a
     *  fixed slug ('full', 'deposit', 'balance'). For MILESTONE the
     *  convention is 'm-1', 'm-2', .... Any string works — the DB
     *  only enforces uniqueness of the triple below. */
    issuanceKey: text('issuance_key').notNull().default('full'),
    /** Free-text note describing what portion of the pro forma this
     *  invoice covers ("Milestone 1 of 3", or empty for the single
     *  FULL_PAYMENT case). */
    coverage: text('coverage'),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    /** No official invoice can ever be linked to two different pro formas. */
    unique('pro_forma_official_invoices_invoice_unique').on(t.invoiceId),
    /** The explicit purpose/key uniqueness — this is what prevents
     *  duplicate issuance for the same logical reason within one PF. */
    unique('pro_forma_official_invoices_purpose_unique').on(
      t.proFormaInvoiceId,
      t.purpose,
      t.issuanceKey,
    ),
    index('pro_forma_official_invoices_proforma_idx').on(t.proFormaInvoiceId),
    check(
      'pro_forma_official_invoices_purpose_check',
      sql`${t.purpose} IN ('FULL_PAYMENT','DEPOSIT','BALANCE','MILESTONE','AMENDMENT')`,
    ),
  ],
);

export type ProFormaOfficialInvoice = typeof proFormaOfficialInvoices.$inferSelect;
export type NewProFormaOfficialInvoice = typeof proFormaOfficialInvoices.$inferInsert;
export type ProFormaOfficialInvoicePurpose = ProFormaOfficialInvoice['purpose'];

/**
 * Immutable snapshot of a pro forma at the moment of each ISSUED state.
 *
 * Rules:
 *   - A row is written when a DRAFT is first ISSUED (revision = 1).
 *   - A row is written on every subsequent edit of an already-ISSUED
 *     pro forma; the live pro_forma_invoices row then takes revision = N+1.
 *   - No row is ever written for DRAFT edits — those are freely mutable.
 *   - No row is ever written after ACCEPTED. Accepted agreements can only
 *     change via an explicit amendment or replacement workflow (Stage 3).
 *
 * The snapshot stores the full invoice header + line items as JSONB so
 * the printable can render any historical revision without replaying
 * joins against drifting foreign keys (service names, currency rates).
 */
export const proFormaRevisions = pgTable(
  'pro_forma_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proFormaInvoiceId: uuid('pro_forma_invoice_id')
      .notNull()
      .references(() => proFormaInvoices.id, { onDelete: 'cascade' }),
    /** Revision number this snapshot represents. The live pro forma's
     *  current revision is always `max(revision)` in this table (or 0
     *  if never issued). */
    revision: integer('revision').notNull(),
    /** Full header + line items snapshot. Shape mirrors the ProFormaView
     *  type returned by the read layer — intentionally duplicated so the
     *  printable isn't coupled to today's query shape. */
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    /** Optional free-text explanation of what changed. */
    reason: text('reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt,
  },
  (t) => [
    index('pro_forma_revisions_proforma_idx').on(t.proFormaInvoiceId),
    unique('pro_forma_revisions_unique').on(t.proFormaInvoiceId, t.revision),
    check('pro_forma_revisions_revision_pos', sql`${t.revision} >= 1`),
  ],
);

export type ProFormaRevision = typeof proFormaRevisions.$inferSelect;
export type NewProFormaRevision = typeof proFormaRevisions.$inferInsert;

/**
 * Pre-issuance refund — Stage 4.1.
 *
 * ── Why a separate table (not `refunds`) ─────────────────────────────
 * `refunds.credit_note_id` is NOT NULL, and credit_notes require an
 * invoice. Pre-issuance means no invoice exists yet, so the existing
 * refund mechanism cannot apply — creating a dummy invoice + credit
 * note just to allow the refund would pollute the official ledger
 * with fictional documents (explicitly forbidden by the Stage 4.1
 * brief). This table captures the operation as a first-class entity:
 * a verified payment against an ACCEPTED pro forma is partially or
 * fully returned to the payer before any INV number is minted.
 *
 * ── Idempotency ──────────────────────────────────────────────────────
 * UNIQUE (payment_id, idempotency_key) — caller supplies the key.
 * Retries with the same key return the existing row rather than
 * creating a second refund. Simultaneous attempts race-safe via the
 * payment-row FOR UPDATE lock in the writer + the UNIQUE as backstop.
 *
 * ── Payment status transitions ───────────────────────────────────────
 *   VERIFIED  → PARTIALLY_REFUNDED (if cumulative refunds < payment.amount)
 *            → REFUNDED            (if cumulative refunds == payment.amount)
 * The original payment row is never deleted; refund amounts simply
 * offset it in the balance query.
 *
 * ── Ledger ───────────────────────────────────────────────────────────
 * Emits REFUND_ISSUED into financial_events via the same outbox so the
 * accounting cron picks it up. Payload includes payment_id, pro_forma
 * number, amount, currency, actor.
 */
export const proFormaPaymentRefunds = pgTable(
  'pro_forma_payment_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').notNull(),
    proFormaInvoiceId: uuid('pro_forma_invoice_id')
      .notNull()
      .references(() => proFormaInvoices.id),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    reason: text('reason').notNull(),
    method: text('method', { enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] }).notNull(),
    reference: text('reference'),
    /** Caller-supplied dedup key. Simultaneous Finance operators
     *  retrying the same request get the existing row returned
     *  instead of a second refund. */
    idempotencyKey: text('idempotency_key').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('pf_payment_refunds_payment_idx').on(t.paymentId),
    index('pf_payment_refunds_proforma_idx').on(t.proFormaInvoiceId),
    unique('pf_payment_refunds_idempotency_unique').on(t.paymentId, t.idempotencyKey),
    check('pf_payment_refunds_amount_pos', sql`${t.amount} > 0`),
    check('pf_payment_refunds_method_check', sql`${t.method} IN ('BANK_TRANSFER','CASH','OTHER')`),
  ],
);

export type ProFormaPaymentRefund = typeof proFormaPaymentRefunds.$inferSelect;
export type NewProFormaPaymentRefund = typeof proFormaPaymentRefunds.$inferInsert;
