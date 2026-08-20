import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { serviceCatalogItems } from './services';
import { users } from './users';

/**
 * A person's pre-activation inquiry. Becomes a CandidateProfile via
 * (a) verified payment or (b) staff manual override.
 */
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id')
    .notNull()
    .references(() => persons.id),
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
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt,
  updatedAt,
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadStatus = Lead['status'];
