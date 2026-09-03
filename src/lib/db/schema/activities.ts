import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { serviceEngagements } from './commerce';
import { immigrationCases } from './immigration';
import { persons } from './persons';
import { employerContacts, employers, jobRequisitions } from './recruitment';
import { users } from './users';

/**
 * Communication is an ACTIVITY, not a lifecycle state.
 * Multiple nullable subject FKs — no polymorphic subject_type.
 * CHECK ensures at least one subject is set so we always know what it's about.
 */
export const communicationLogs = pgTable(
  'communication_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type', { enum: ['EMAIL', 'PHONE', 'MEETING', 'INTERNAL_NOTE', 'OTHER'] }).notNull(),
    direction: text('direction', { enum: ['INBOUND', 'OUTBOUND', 'INTERNAL'] })
      .notNull()
      .default('OUTBOUND'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    staffUserId: uuid('staff_user_id')
      .notNull()
      .references(() => users.id),
    subject: varchar('subject', { length: 255 }),
    body: text('body'),
    personId: uuid('person_id').references(() => persons.id),
    employerId: uuid('employer_id').references(() => employers.id),
    employerContactId: uuid('employer_contact_id').references(() => employerContacts.id),
    jobRequisitionId: uuid('job_requisition_id').references(() => jobRequisitions.id),
    serviceEngagementId: uuid('service_engagement_id').references(() => serviceEngagements.id),
    immigrationCaseId: uuid('immigration_case_id').references(() => immigrationCases.id),
    followUpRequired: boolean('follow_up_required').notNull().default(false),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'communication_logs_has_subject',
      sql`${t.personId} IS NOT NULL OR ${t.employerId} IS NOT NULL OR ${t.employerContactId} IS NOT NULL OR ${t.jobRequisitionId} IS NOT NULL OR ${t.serviceEngagementId} IS NOT NULL OR ${t.immigrationCaseId} IS NOT NULL`,
    ),
    index('communication_logs_person_idx').on(t.personId, t.occurredAt),
    index('communication_logs_employer_idx').on(t.employerId, t.occurredAt),
    index('communication_logs_requisition_idx').on(t.jobRequisitionId, t.occurredAt),
    index('communication_logs_occurred_idx').on(t.occurredAt),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    assignedUserId: uuid('assigned_user_id')
      .notNull()
      .references(() => users.id),
    priority: text('priority', { enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] })
      .notNull()
      .default('NORMAL'),
    status: text('status', { enum: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] })
      .notNull()
      .default('OPEN'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    personId: uuid('person_id').references(() => persons.id),
    employerId: uuid('employer_id').references(() => employers.id),
    jobRequisitionId: uuid('job_requisition_id').references(() => jobRequisitions.id),
    serviceEngagementId: uuid('service_engagement_id').references(() => serviceEngagements.id),
    immigrationCaseId: uuid('immigration_case_id').references(() => immigrationCases.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('tasks_assigned_status_due_idx').on(t.assignedUserId, t.status, t.dueAt),
    index('tasks_person_idx').on(t.personId),
    index('tasks_employer_idx').on(t.employerId),
    index('tasks_requisition_idx').on(t.jobRequisitionId),
    index('tasks_immigration_case_idx').on(t.immigrationCaseId),
  ],
);

export type CommunicationLog = typeof communicationLogs.$inferSelect;
export type NewCommunicationLog = typeof communicationLogs.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
