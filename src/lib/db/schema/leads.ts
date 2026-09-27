import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { employers } from './recruitment';
import { serviceCatalogItems } from './services';
import { users } from './users';

/**
 * A pre-activation inquiry that flows through the whole business. Every lead
 * targets exactly one business (Candidate Services, Recruitment, Immigration)
 * so it can be materialised into the right entity on Accept without asking
 * the operator to pick the destination again.
 *
 * Payer shape depends on target_business:
 *   - CANDIDATE_SERVICES / IMMIGRATION → person_id set, employer_id null
 *   - RECRUITMENT                      → employer_id set, person_id null
 *
 * (An employer is our client for recruitment; a person is our client for
 *  candidate services + immigration.)
 *
 * On Accept:
 *   - CS         → a candidate_profile is materialised for person_id
 *   - Immigration → an immigration_cases row is created for person_id
 *   - Recruitment → a job_requisitions row is created for employer_id
 *   accepted_entity_id points at the newly-created row so every follow-up
 *   invoice / receipt / document can back-link to it.
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Which part of the business this lead is destined for. */
    targetBusiness: text('target_business', {
      enum: ['CANDIDATE_SERVICES', 'RECRUITMENT', 'IMMIGRATION'],
    })
      .notNull()
      .default('CANDIDATE_SERVICES'),
    personId: uuid('person_id').references(() => persons.id),
    employerId: uuid('employer_id').references(() => employers.id),
    status: text('status', {
      enum: ['NEW', 'CONTACTED', 'AWAITING_PAYMENT', 'CONVERTED', 'LOST', 'REJECTED'],
    })
      .notNull()
      .default('NEW'),
    serviceOfInterestId: uuid('service_of_interest_id').references(() => serviceCatalogItems.id),
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    notes: text('notes'),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    convertedByUserId: uuid('converted_by_user_id').references(() => users.id),
    conversionMethod: text('conversion_method', {
      enum: ['PAYMENT_VERIFIED', 'MANUAL_OVERRIDE'],
    }),
    /** When the lead was Accepted into its target business. Distinct from
     *  convertedAt, which still tracks the classic CS 'became a candidate'
     *  moment; acceptedAt is the generalised handoff for all three targets. */
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id),
    /** UUID of the newly-created candidate_profile / immigration_case /
     *  job_requisition. FK omitted intentionally — polymorphic. */
    acceptedEntityId: uuid('accepted_entity_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('leads_assigned_idx').on(t.assignedUserId),
    index('leads_target_business_idx').on(t.targetBusiness),
    index('leads_employer_idx').on(t.employerId),
    // Payer-shape invariant: exactly one of person_id / employer_id set, and
    // it must match target_business. Enforced in-DB so bad rows can't sneak
    // in via ad-hoc SQL.
    check(
      'leads_payer_matches_target',
      sql`
        (
          ${t.targetBusiness} = 'RECRUITMENT'
          AND ${t.employerId} IS NOT NULL
          AND ${t.personId} IS NULL
        )
        OR (
          ${t.targetBusiness} IN ('CANDIDATE_SERVICES', 'IMMIGRATION')
          AND ${t.personId} IS NOT NULL
          AND ${t.employerId} IS NULL
        )
      `,
    ),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadStatus = Lead['status'];
export type LeadTargetBusiness = Lead['targetBusiness'];
