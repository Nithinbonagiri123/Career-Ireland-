import { sql } from 'drizzle-orm';
import { check, jsonb, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
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
     * Standard VAT rate applied on every invoice line, as a percent.
     * Owner default = 23.00 (Ireland's standard VAT rate). Editable
     * from /admin/settings — set to 0 if not VAT-registered so the
     * invoice shows "VAT €0.00". Never hardcoded per the
     * no-hardcoded-document-content rule.
     */
    vatRatePercent: numeric('vat_rate_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('23.00'),

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
