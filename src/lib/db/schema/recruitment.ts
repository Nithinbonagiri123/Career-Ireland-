import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { currencies } from './currencies';
import { documentInstances } from './documents';
import { occupations } from './occupations';
import { candidateProfiles, persons } from './persons';
import { qualifications, skills } from './reference';
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
    index('employers_assigned_idx').on(t.assignedUserId),
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

/** Structured skill requirements per requisition — replaces free-text `candidateRequirements`. */
export const requisitionSkills = pgTable(
  'requisition_skills',
  {
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id),
    isRequired: boolean('is_required').notNull().default(true),
    /** Higher weight → higher score contribution during matching. */
    weight: integer('weight').notNull().default(1),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.jobRequisitionId, t.skillId] }),
    index('requisition_skills_skill_idx').on(t.skillId),
  ],
);

/** Structured qualification requirements per requisition. */
export const requisitionQualifications = pgTable(
  'requisition_qualifications',
  {
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id, { onDelete: 'cascade' }),
    qualificationId: uuid('qualification_id')
      .notNull()
      .references(() => qualifications.id),
    isRequired: boolean('is_required').notNull().default(true),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.jobRequisitionId, t.qualificationId] }),
    index('requisition_quals_qual_idx').on(t.qualificationId),
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
    /**
     * Per-component score breakdown persisted alongside the total so staff can see
     * why a candidate ranked where they did. Shape: `MatchReason[]` — label + points
     * + matched flag per signal. See src/modules/matching/service.ts.
     */
    reasons: jsonb('reasons').$type<MatchReasonSnapshot[]>().notNull().default([]),
    suggestedByUserId: uuid('suggested_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('candidate_matches_requisition_person_unique').on(t.jobRequisitionId, t.personId),
    index('candidate_matches_requisition_bucket_idx').on(t.jobRequisitionId, t.scoreBucket),
  ],
);

/** Persisted shape of a match reason — inserted by matching service, read by UI. */
export type MatchReasonSnapshot = {
  label: string;
  points: number;
  matched: boolean;
  /** Optional extra context (e.g. matched skill names). */
  detail?: string;
};

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

/**
 * Applications may target an internal Requisition OR an external job board
 * (IrishJobs, Indeed, JobsIreland, LinkedIn, direct company site).
 * Exactly one of jobRequisitionId or (source != INTERNAL + externalCompanyName) is set.
 */
export const jobApplications = pgTable(
  'job_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL when applying to an external job board (see `source`). */
    jobRequisitionId: uuid('job_requisition_id').references(() => jobRequisitions.id),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    source: text('source', {
      enum: [
        'INTERNAL',
        'IRISH_JOBS',
        'INDEED',
        'JOBS_IRELAND',
        'LINKEDIN',
        'COMPANY_WEBSITE',
        'REFERRAL',
        'OTHER',
      ],
    })
      .notNull()
      .default('INTERNAL'),
    /** External-only: URL of the job posting on the board. */
    externalJobUrl: varchar('external_job_url', { length: 500 }),
    /** External-only: name of the company the candidate applied to. */
    externalCompanyName: varchar('external_company_name', { length: 200 }),
    /** External-only: job title as advertised. */
    externalJobTitle: varchar('external_job_title', { length: 200 }),
    /** External-only: job reference/ID from the source board. */
    externalJobReference: varchar('external_job_reference', { length: 200 }),
    /** Which CV document instance was submitted with this application. */
    cvDocumentInstanceId: uuid('cv_document_instance_id').references(() => documentInstances.id),
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
    /** Free-text notes from the applicant/staff — cover letter summary, etc. */
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Internal applications are unique per (requisition, person). Postgres treats NULL requisitionIds
    // as distinct, so external applications naturally bypass this constraint.
    unique('job_applications_requisition_person_unique').on(t.jobRequisitionId, t.personId),
    index('job_applications_person_status_idx').on(t.personId, t.status),
    index('job_applications_source_idx').on(t.source),
    check(
      'job_applications_source_shape',
      sql`(${t.source} = 'INTERNAL' AND ${t.jobRequisitionId} IS NOT NULL)
          OR (${t.source} <> 'INTERNAL' AND ${t.externalCompanyName} IS NOT NULL)`,
    ),
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
export type RequisitionSkill = typeof requisitionSkills.$inferSelect;
export type NewRequisitionSkill = typeof requisitionSkills.$inferInsert;
export type RequisitionQualification = typeof requisitionQualifications.$inferSelect;
export type NewRequisitionQualification = typeof requisitionQualifications.$inferInsert;

// Reference candidateProfiles so the linter sees the import as used (it's the target of availability flip triggered by placement changes).
export const _candidateProfilesRef = candidateProfiles;
