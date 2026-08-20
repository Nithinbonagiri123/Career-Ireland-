import { date, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { serviceEngagements } from './commerce';
import { persons } from './persons';
import { employers, jobRequisitions, placements } from './recruitment';

/**
 * Immigration cases — one entity, discriminated by case_type.
 * Independent capability: not required to reference a Placement (Scenario B).
 */
export const immigrationCases = pgTable(
  'immigration_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseType: text('case_type', {
      enum: ['EMPLOYMENT_PERMIT', 'VISA', 'VISA_EXTENSION'],
    }).notNull(),
    beneficiaryPersonId: uuid('beneficiary_person_id')
      .notNull()
      .references(() => persons.id),
    sponsorEmployerId: uuid('sponsor_employer_id').references(() => employers.id),
    relatedPlacementId: uuid('related_placement_id').references(() => placements.id),
    relatedJobRequisitionId: uuid('related_job_requisition_id').references(
      () => jobRequisitions.id,
    ),
    serviceEngagementId: uuid('service_engagement_id').references(() => serviceEngagements.id),
    status: text('status', {
      enum: [
        'OPEN',
        'DOCUMENTS_PENDING',
        'SUBMITTED',
        'UNDER_AUTHORITY_REVIEW',
        'APPROVED',
        'REJECTED',
        'CLOSED',
      ],
    })
      .notNull()
      .default('OPEN'),
    authorityReference: varchar('authority_reference', { length: 120 }),
    submittedAt: date('submitted_at'),
    decisionAt: date('decision_at'),
    expiresOn: date('expires_on'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('immigration_cases_beneficiary_type_idx').on(t.beneficiaryPersonId, t.caseType),
    index('immigration_cases_sponsor_idx').on(t.sponsorEmployerId),
    index('immigration_cases_status_idx').on(t.status),
    index('immigration_cases_expires_idx').on(t.expiresOn),
  ],
);

export type ImmigrationCase = typeof immigrationCases.$inferSelect;
export type NewImmigrationCase = typeof immigrationCases.$inferInsert;
