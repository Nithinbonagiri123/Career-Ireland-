import { sql } from 'drizzle-orm';
import { char, check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';
import { documentInstances } from './documents';
import { persons } from './persons';
import { proFormaInvoices } from './proformas';
import { employers } from './recruitment';
import { serviceCatalogItems, servicePackages } from './services';
import { users } from './users';

/**
 * A service "order" — the commercial engagement between Ireland Career Gateway and a payer
 * (either a Person, e.g. candidate paying for job search, OR an Employer, e.g. paying
 * for a permit for their placed candidate). Beneficiary is optional (a permit's
 * beneficiary is the candidate, even when the employer pays).
 */
export const serviceEngagements = pgTable(
  'service_engagements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceCatalogItemId: uuid('service_catalog_item_id')
      .notNull()
      .references(() => serviceCatalogItems.id),
    servicePackageId: uuid('service_package_id').references(() => servicePackages.id),
    payerPersonId: uuid('payer_person_id').references(() => persons.id),
    payerEmployerId: uuid('payer_employer_id').references(() => employers.id),
    beneficiaryPersonId: uuid('beneficiary_person_id').references(() => persons.id),
    /** Reserved for cross-module linking; FKs added when those modules land. */
    relatedPlacementId: uuid('related_placement_id'),
    relatedJobRequisitionId: uuid('related_job_requisition_id'),
    relatedImmigrationCaseId: uuid('related_immigration_case_id'),
    agreedAmount: numeric('agreed_amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    status: text('status', {
      enum: ['REQUESTED', 'PENDING_PAYMENT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    })
      .notNull()
      .default('REQUESTED'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'service_engagements_payer_xor',
      sql`(${t.payerPersonId} IS NOT NULL) <> (${t.payerEmployerId} IS NOT NULL)`,
    ),
    index('service_engagements_payer_person_idx').on(t.payerPersonId),
    index('service_engagements_payer_employer_idx').on(t.payerEmployerId),
    index('service_engagements_beneficiary_idx').on(t.beneficiaryPersonId),
    index('service_engagements_status_idx').on(t.status),
  ],
);

export type ServiceEngagement = typeof serviceEngagements.$inferSelect;
export type NewServiceEngagement = typeof serviceEngagements.$inferInsert;

/**
 * One or many payments per engagement (allows installments).
 * Verified status is the trigger for the engagement's PAYMENT_VERIFIED transition
 * — handled in the service layer, always inside a transaction.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceEngagementId: uuid('service_engagement_id')
      .notNull()
      .references(() => serviceEngagements.id),
    /** Stage 1 additive: lets a payment be reconciled against an accepted
     *  pro forma without changing the engagement-based accounting path.
     *  Nullable so (a) historical payments keep working untouched and
     *  (b) non-CS payments (recruitment / immigration) that have no
     *  pro-forma concept stay valid. The Stage 2 payment service uses
     *  this column to decide when to trigger official-invoice issuance;
     *  until then it has no behavioural effect. No FK here — see the
     *  table below (proformas.ts doesn't import from commerce.ts so the
     *  one-way reference is safe). */
    proFormaInvoiceId: uuid('pro_forma_invoice_id').references(() => proFormaInvoices.id),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    /** Stage 6G Screen 10 — CARD added for direct card payments taken
     *  on an external terminal; no card data is ever stored, only the
     *  operator-entered reference. Refund methods stay BANK_TRANSFER /
     *  CASH / OTHER (a card refund is recorded as the channel the money
     *  actually moves back through). */
    method: text('method', { enum: ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] }).notNull(),
    status: text('status', {
      enum: ['PENDING', 'PROOF_UPLOADED', 'VERIFIED', 'REJECTED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
    })
      .notNull()
      .default('PENDING'),
    /** External reference (bank statement ID, cash receipt number). Real S3 proof lands in 5.7. */
    proofReference: text('proof_reference'),
    proofDocumentInstanceId: uuid('proof_document_instance_id').references(
      () => documentInstances.id,
    ),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    verifiedByUserId: uuid('verified_by_user_id').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('payments_engagement_idx').on(t.serviceEngagementId),
    index('payments_status_idx').on(t.status),
    index('payments_pro_forma_idx').on(t.proFormaInvoiceId),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
