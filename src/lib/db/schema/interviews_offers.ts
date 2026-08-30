import {
  char,
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
import { jobApplications } from './recruitment';
import { users } from './users';

/**
 * Scheduled or conducted interviews for a job application.
 * Multiple rows per application — supports multi-round interview processes.
 */
export const interviews = pgTable(
  'interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobApplicationId: uuid('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes'),
    mode: text('mode', {
      enum: ['PHONE', 'VIDEO', 'IN_PERSON', 'PANEL'],
    })
      .notNull()
      .default('VIDEO'),
    /** Interview round number (1-based). 1 = first round. */
    round: integer('round').notNull().default(1),
    /** Physical address for IN_PERSON, or meeting URL for VIDEO. */
    location: varchar('location', { length: 500 }),
    /** Free-text interviewer names — external interviewers who aren't system users. */
    interviewerNames: text('interviewer_names'),
    /** Internal staff who scheduled/led the interview. */
    scheduledByUserId: uuid('scheduled_by_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', {
      enum: ['SCHEDULED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED'],
    })
      .notNull()
      .default('SCHEDULED'),
    outcome: text('outcome', {
      enum: ['PENDING', 'PASS', 'FAIL', 'HOLD'],
    })
      .notNull()
      .default('PENDING'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('interviews_application_idx').on(t.jobApplicationId),
    index('interviews_scheduled_idx').on(t.scheduledAt),
    index('interviews_status_idx').on(t.status),
  ],
);

/**
 * Offers extended to a candidate for a specific application.
 * Multiple rows per application — supports negotiation (revised offer sent as new row).
 */
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobApplicationId: uuid('job_application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    currencyCode: char('currency_code', { length: 3 })
      .notNull()
      .references(() => currencies.code),
    /** Salary period — annual / monthly / hourly for clarity. */
    period: text('period', {
      enum: ['ANNUAL', 'MONTHLY', 'WEEKLY', 'HOURLY'],
    })
      .notNull()
      .default('ANNUAL'),
    startDate: date('start_date'),
    /** Date by which the candidate must respond. */
    expiresOn: date('expires_on'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    status: text('status', {
      enum: ['DRAFT', 'SENT', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
    })
      .notNull()
      .default('DRAFT'),
    terms: text('terms'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('offers_application_idx').on(t.jobApplicationId),
    index('offers_status_idx').on(t.status),
  ],
);

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
