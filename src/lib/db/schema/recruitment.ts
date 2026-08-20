import {
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';
import { occupations } from './occupations';
import { candidateProfiles, persons } from './persons';
import { users } from './users';

export const employers = pgTable(
  'employers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: varchar('legal_name', { length: 200 }).notNull(),
    tradingName: varchar('trading_name', { length: 200 }),
    website: varchar('website', { length: 255 }),
    industry: varchar('industry', { length: 120 }),
    country: varchar('country', { length: 80 }),
    city: varchar('city', { length: 120 }),
    relationshipStatus: text('relationship_status', {
      enum: ['PROSPECT', 'ACTIVE', 'ON_HOLD', 'ARCHIVED'],
    })
      .notNull()
      .default('PROSPECT'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('employers_legal_name_idx').on(t.legalName),
    index('employers_status_idx').on(t.relationshipStatus),
  ],
);

export const employerContacts = pgTable(
  'employer_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employerId: uuid('employer_id')
      .notNull()
      .references(() => employers.id),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    jobTitle: varchar('job_title', { length: 120 }),
    email: varchar('email', { length: 200 }),
    phone: varchar('phone', { length: 30 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Optional link to Person: used later if this contact is (or becomes) a candidate too. */
    personId: uuid('person_id').references(() => persons.id),
    createdAt,
    updatedAt,
  },
  (t) => [index('employer_contacts_employer_idx').on(t.employerId)],
);

export const jobRequisitions = pgTable(
  'job_requisitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employerId: uuid('employer_id')
      .notNull()
      .references(() => employers.id),
    primaryContactId: uuid('primary_contact_id').references(() => employerContacts.id),
    title: varchar('title', { length: 200 }).notNull(),
    occupationId: uuid('occupation_id').references(() => occupations.id),
    positionsRequired: integer('positions_required').notNull().default(1),
    positionsFilled: integer('positions_filled').notNull().default(0),
    location: varchar('location', { length: 200 }),
    employmentType: text('employment_type', {
      enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMP'],
    })
      .notNull()
      .default('FULL_TIME'),
    salaryMin: numeric('salary_min', { precision: 14, scale: 2 }),
    salaryMax: numeric('salary_max', { precision: 14, scale: 2 }),
    salaryCurrencyCode: char('salary_currency_code', { length: 3 }).references(
      () => currencies.code,
    ),
    description: text('description'),
    candidateRequirements: text('candidate_requirements'),
    status: text('status', {
      enum: ['DRAFT', 'OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED', 'FILLED', 'CLOSED', 'CANCELLED'],
    })
      .notNull()
      .default('DRAFT'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    targetFillDate: date('target_fill_date'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('job_requisitions_employer_status_idx').on(t.employerId, t.status),
    index('job_requisitions_occupation_idx').on(t.occupationId),
    index('job_requisitions_assigned_idx').on(t.assignedUserId),
  ],
);

export const candidateMatches = pgTable(
  'candidate_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    score: integer('score').notNull().default(0),
    scoreBucket: text('score_bucket', { enum: ['HIGH', 'MEDIUM', 'LOW'] })
      .notNull()
      .default('LOW'),
    source: text('source', { enum: ['MANUAL', 'ASSISTED'] })
      .notNull()
      .default('ASSISTED'),
    status: text('status', {
      enum: ['SUGGESTED', 'REVIEWED', 'DISMISSED', 'SHORTLISTED'],
    })
      .notNull()
      .default('SUGGESTED'),
    suggestedByUserId: uuid('suggested_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('candidate_matches_requisition_person_unique').on(t.jobRequisitionId, t.personId),
    index('candidate_matches_requisition_bucket_idx').on(t.jobRequisitionId, t.scoreBucket),
  ],
);

export const shortlistEntries = pgTable(
  'shortlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    candidateMatchId: uuid('candidate_match_id').references(() => candidateMatches.id),
    presentedToEmployerAt: timestamp('presented_to_employer_at', { withTimezone: true }),
    employerFeedback: text('employer_feedback'),
    createdAt,
    updatedAt,
  },
  (t) => [unique('shortlist_entries_requisition_person_unique').on(t.jobRequisitionId, t.personId)],
);

export const jobApplications = pgTable(
  'job_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    status: text('status', {
      enum: [
        'APPLIED',
        'UNDER_REVIEW',
        'SHORTLISTED',
        'INTERVIEW',
        'OFFER',
        'ACCEPTED',
        'REJECTED',
        'WITHDRAWN',
      ],
    })
      .notNull()
      .default('APPLIED'),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    interviewAt: timestamp('interview_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('job_applications_requisition_person_unique').on(t.jobRequisitionId, t.personId),
    index('job_applications_person_status_idx').on(t.personId, t.status),
  ],
);

export const placements = pgTable(
  'placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    employerId: uuid('employer_id')
      .notNull()
      .references(() => employers.id),
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id),
    jobApplicationId: uuid('job_application_id').references(() => jobApplications.id),
    status: text('status', {
      enum: ['PROPOSED', 'CONFIRMED', 'STARTED', 'COMPLETED', 'TERMINATED_EARLY'],
    })
      .notNull()
      .default('PROPOSED'),
    offerDate: date('offer_date'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    salary: numeric('salary', { precision: 14, scale: 2 }),
    salaryCurrencyCode: char('salary_currency_code', { length: 3 }).references(
      () => currencies.code,
    ),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('placements_person_idx').on(t.personId),
    index('placements_employer_idx').on(t.employerId),
    index('placements_status_idx').on(t.status),
  ],
);

export type Employer = typeof employers.$inferSelect;
export type NewEmployer = typeof employers.$inferInsert;
export type EmployerContact = typeof employerContacts.$inferSelect;
export type NewEmployerContact = typeof employerContacts.$inferInsert;
export type JobRequisition = typeof jobRequisitions.$inferSelect;
export type NewJobRequisition = typeof jobRequisitions.$inferInsert;
export type CandidateMatch = typeof candidateMatches.$inferSelect;
export type NewCandidateMatch = typeof candidateMatches.$inferInsert;
export type ShortlistEntry = typeof shortlistEntries.$inferSelect;
export type NewShortlistEntry = typeof shortlistEntries.$inferInsert;
export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;
export type Placement = typeof placements.$inferSelect;
export type NewPlacement = typeof placements.$inferInsert;

// Reference candidateProfiles so the linter sees the import as used (it's the target of availability flip triggered by placement changes).
export const _candidateProfilesRef = candidateProfiles;
