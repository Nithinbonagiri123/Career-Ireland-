import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { citext, createdAt, updatedAt } from './_shared';
import { occupations } from './occupations';
import { users } from './users';

/**
 * Root identity for every human in the system.
 * Candidates, Leads, Recruitment Prospects, Applicants all attach to a Person as role records.
 * NEVER duplicate a human — dedup via fuzzy match + staff-confirmed merge (merged_into_person_id).
 */
export const persons = pgTable(
  'persons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    /** Optional middle name — captured on CS lead creation form; nullable
     *  so historical persons stay valid without backfill. */
    middleName: varchar('middle_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: citext('email'),
    /** Application-normalized (lower-cased, trimmed) — populated on insert/update. */
    normalizedEmail: citext('normalized_email'),
    phone: varchar('phone', { length: 30 }),
    /** Application-normalized (digits + leading + only) — populated on insert/update. */
    normalizedPhone: varchar('normalized_phone', { length: 30 }),
    dateOfBirth: date('date_of_birth'),
    nationality: varchar('nationality', { length: 80 }),
    currentCountry: varchar('current_country', { length: 80 }),
    currentCity: varchar('current_city', { length: 120 }),
    /** Street address lines — captured on CS lead creation. Nullable
     *  so historical persons (and recruitment / immigration persons
     *  that don't collect address today) stay valid. */
    addressLine1: varchar('address_line_1', { length: 255 }),
    addressLine2: varchar('address_line_2', { length: 255 }),
    /** Stage 6G Screen 02 — residential postcode captured on the New
     *  Lead form. Nullable so Recruitment / Immigration / historical
     *  rows stay valid. */
    postcode: varchar('postcode', { length: 20 }),
    /** Stage 6G Screen 02 — freeform band ("5 years", "<1 year", "20+"),
     *  matching the field already on `candidate_profiles` but captured
     *  at lead-time so it survives before activation. */
    yearsOfExperience: varchar('years_of_experience', { length: 60 }),
    /** Stage 6G Screen 02 — captured on the New Lead form.
     *  EMPLOYED | UNEMPLOYED | SELF_EMPLOYED | STUDENT | RETIRED | OTHER.
     *  Enum enforced in TS; column is text so adding new options is
     *  schema-free. */
    employmentStatus: text('employment_status', {
      enum: ['EMPLOYED', 'UNEMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'RETIRED', 'OTHER'],
    }),
    /** Stage 6G Screen 02 — short freeform blurb written by the
     *  operator on intake. Separate from `notes` (operator-only) and
     *  from candidate_profiles.profile_summary (post-activation).
     *  Copied forward on lead → candidate activation. */
    professionalSummary: text('professional_summary'),
    /** Stage 6G Screen 02 — eligibility to work in Ireland, captured on
     *  intake. Distinct from `irish_immigration_status` which is about
     *  the person's current stamp. This is the broader classification
     *  the operator uses to triage the lead. Plain text column so
     *  historical candidate_profiles.work_eligibility strings also fit
     *  on the person row at edit-time; zod + UI enforce the enum shape
     *  on new writes. */
    workEligibility: text('work_eligibility'),
    /** Stage 6G Screen 02 — "Do you currently live in Ireland?". Three
     *  states: Yes (true), No (false), Unknown (NULL). */
    currentlyInIreland: boolean('currently_in_ireland'),
    /** Primary profession at the identity level. Chosen as the single
     *  source of truth over candidate_profiles.primary_occupation_id
     *  because profession is an attribute of the human, not of their
     *  lead/candidate role — so it's readable pre-conversion and
     *  consistent across business lines. candidate_profiles still has
     *  its own column for backward compatibility; lead-to-candidate
     *  conversion (Stage 3) copies this value into the candidate profile. */
    primaryOccupationId: uuid('primary_occupation_id').references(
      (): AnyPgColumn => occupations.id,
    ),
    source: text('source', {
      enum: ['DIRECT', 'REFERRAL', 'ADVERTISEMENT', 'EMPLOYER_REFERRAL', 'OTHER'],
    }).default('DIRECT'),
    /**
     * Stage 6E+1 — structured Irish immigration status captured at
     * lead creation. Previously Stage 6E stored this with a
     *     `[Irish immigration status: Stamp 4]`
     * marker in `notes`; a one-off scan in migration 0055 lifts those
     * marker values into this column. The field is nullable because
     * most pre-6E leads never set it.
     *
     * Values mirror the enum in `src/lib/iso-countries.ts`
     * (IRISH_IMMIGRATION_STATUSES). Rendered on the Candidate Card +
     * Client Workspace alongside the immigration-case detail so a
     * current permission is never confused with an application/case.
     */
    irishImmigrationStatus: text('irish_immigration_status', {
      enum: [
        'NONE',
        'STAMP_1',
        'STAMP_1G',
        'STAMP_2',
        'STAMP_3',
        'STAMP_4',
        'OTHER',
        'PENDING',
        'NOT_PROVIDED',
      ],
    }),
    notes: text('notes'),
    /** If populated, this person has been merged into another — follow the pointer. */
    mergedIntoPersonId: uuid('merged_into_person_id').references((): AnyPgColumn => persons.id),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id),
    /**
     * Draft state: the staff-created candidate onboarding form is still open
     * and hasn't been finalised (payment + candidate profile creation). Draft
     * rows are hidden from every downstream reader — list pages, CSV exports,
     * search, matching, dashboards — until the form's Create action commits.
     * A nightly cron sweeps drafts older than 7 days.
     */
    isDraft: boolean('is_draft').notNull().default(false),
    draftedByUserId: uuid('drafted_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('persons_normalized_email_idx').on(t.normalizedEmail),
    index('persons_normalized_phone_idx').on(t.normalizedPhone),
    index('persons_name_idx').on(t.lastName, t.firstName),
    index('persons_merged_idx').on(t.mergedIntoPersonId),
    // Partial index — most lookups skip drafts, keep this narrow.
    index('persons_draft_idx').on(t.isDraft).where(sql`${t.isDraft} = true`),
    // Uniqueness on normalized values; multiple NULLs are allowed (persons without email/phone).
    unique('persons_normalized_email_unique').on(t.normalizedEmail),
    unique('persons_normalized_phone_unique').on(t.normalizedPhone),
  ],
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type PersonSource = NonNullable<Person['source']>;

/**
 * Materialised active-candidate role record. One-to-one with Person.
 * A Person becomes a Candidate through Lead activation (payment or manual override).
 */
export const candidateProfiles = pgTable(
  'candidate_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .unique()
      .references(() => persons.id),
    primaryOccupationId: uuid('primary_occupation_id'),
    yearsOfExperience: text('years_of_experience'),
    workEligibility: text('work_eligibility'),
    preferredLocation: varchar('preferred_location', { length: 200 }),
    profileSummary: text('profile_summary'),
    lifecycleStatus: text('lifecycle_status', {
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
    })
      .notNull()
      .default('ACTIVE'),
    availabilityStatus: text('availability_status', {
      enum: ['AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'PLACED'],
    })
      .notNull()
      .default('AVAILABLE'),
    /** Recruiter this candidate is currently assigned to. NULL = unassigned. */
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt,
    updatedAt,
  },
  (t) => [index('candidate_profiles_assigned_idx').on(t.assignedUserId)],
);

export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type NewCandidateProfile = typeof candidateProfiles.$inferInsert;
