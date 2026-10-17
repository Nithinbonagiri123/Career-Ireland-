import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { users } from './users';

/**
 * Singleton table holding every configurable string that ends up on a
 * user-facing document (invoice, receipt, and future printables).
 *
 * Why a singleton row rather than key-value pairs? Every printable
 * consumer needs the whole letterhead in a single fetch — a
 * name/address split across N rows would mean N round-trips or a
 * complex aggregation query on Neon. One row, one query.
 *
 * Enforced-single-row via the CHECK constraint on `id = 'global'`.
 *
 * ── The mandatory rule ──────────────────────────────────────────────
 * No user-facing document content may be baked into source code. Every
 * string, price, company detail, and configurable field on printables
 * MUST come from this table (or from `service_catalog_items` /
 * `service_packages` for prices) and MUST be editable from the admin
 * UI. See memory: no-hardcoded-document-content.
 */
export const appSettings = pgTable(
  'app_settings',
  {
    // Locked to the string literal 'global' by the CHECK below so there
    // can only ever be one row. Callers read + write via helpers in
    // `src/modules/settings/service.ts` — never touch the row directly.
    id: text('id').primaryKey(),

    // ── Company letterhead ─────────────────────────────────────────
    legalName: text('legal_name').notNull(),
    fullLegalName: text('full_legal_name').notNull(),
    /** JSONB array of address lines — order preserved as rendered. */
    addressLines: jsonb('address_lines').$type<string[]>().notNull(),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone'),
    registrationNumber: text('registration_number'),
    vatNumber: text('vat_number'),

    // ── Bank details for the invoice footer ────────────────────────
    bankName: text('bank_name'),
    bankAccountName: text('bank_account_name'),
    bankIban: text('bank_iban'),
    bankBic: text('bank_bic'),

    // ── Tax ─────────────────────────────────────────────────────────
    /**
     * Phase 3 blueprint §8.2 — explicit VAT-registration switch.
     *
     * Previously "VAT off" was implicit: `vatRatePercent = 0.00`. That
     * gave no signal to other surfaces (employer VAT treatment picker,
     * invoice generation, admin UI copy) so each had to re-derive the
     * state. This flag is the single source of truth. When false:
     *   - vat_rate_percent is forced to 0 by the service layer
     *   - invoice printable omits the VAT row entirely
     *   - employer VAT treatment picker is disabled with an explanation
     *   - admin can still edit the rate ahead of registration day
     */
    vatRegistered: boolean('vat_registered').notNull().default(false),

    /**
     * Standard VAT rate applied on every invoice line, as a percent.
     * Default = 0.00 — only consumed when `vatRegistered` is true. The
     * value may be edited in advance of registration day so the owner
     * can line up the correct rate; it stays dormant until the switch
     * flips on. Never hardcoded per no-hardcoded-document-content.
     */
    vatRatePercent: numeric('vat_rate_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0.00'),

    /**
     * Stage 1 additive: date on which VAT registration becomes effective.
     * Nullable while the business is not VAT registered. When set, the
     * Stage 2 invoice issuer must consult this date — invoices issued
     * BEFORE the effective date use rate 0 / treatment OUTSIDE_SCOPE
     * regardless of `vatRegistered`, and invoices issued ON or AFTER
     * use `vatRatePercent` with treatment STANDARD. Historical invoices
     * snapshot their rate on the row (already true via billing.ts), so
     * flipping the switch does NOT retro-tax prior documents.
     */
    vatRegistrationEffectiveDate: date('vat_registration_effective_date'),

    /**
     * Phase 3 blueprint §7.2 — app-wide default payment terms applied
     * when an employer doesn't carry its own per-client override. 14
     * days matches the previous hardcoded OVERDUE_THRESHOLD_DAYS so
     * nothing changes commercially until an operator sets a different
     * value in /admin/settings or on an individual employer record.
     */
    defaultPaymentTermsDays: integer('default_payment_terms_days').notNull().default(14),

    // ── Editable copy on printables ────────────────────────────────
    /** Footer paragraph on invoices. `${contactEmail}` interpolated by
        the renderer if present as a literal template placeholder. */
    invoiceFooter: text('invoice_footer').notNull(),
    receiptFooter: text('receipt_footer').notNull(),

    updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [check('app_settings_singleton', sql`${t.id} = 'global'`)],
);

export type AppSettings = typeof appSettings.$inferSelect;
export type NewAppSettings = typeof appSettings.$inferInsert;

/** The one true id — every helper uses this constant. */
export const APP_SETTINGS_ID = 'global' as const;
