import { sql } from 'drizzle-orm';
import { char, check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';
import { persons } from './persons';
import { serviceCatalogItems, servicePackages } from './services';
import { users } from './users';

/**
 * A service "order" — the commercial engagement between Career Ireland and a payer
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
    payerEmployerId: uuid('payer_employer_id'), // FK added in 5.9 when employers table exists
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
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    method: text('method', { enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] }).notNull(),
    status: text('status', {
      enum: ['PENDING', 'PROOF_UPLOADED', 'VERIFIED', 'REJECTED'],
    })
      .notNull()
      .default('PENDING'),
    /** External reference (bank statement ID, cash receipt number). Real S3 proof lands in 5.7. */
    proofReference: text('proof_reference'),
    proofDocumentInstanceId: uuid('proof_document_instance_id'),
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
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
