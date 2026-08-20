import {
  type AnyPgColumn,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { citext, createdAt, updatedAt } from './_shared';

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
    source: text('source', {
      enum: ['DIRECT', 'REFERRAL', 'ADVERTISEMENT', 'EMPLOYER_REFERRAL', 'OTHER'],
    }).default('DIRECT'),
    notes: text('notes'),
    /** If populated, this person has been merged into another — follow the pointer. */
    mergedIntoPersonId: uuid('merged_into_person_id').references((): AnyPgColumn => persons.id),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('persons_normalized_email_idx').on(t.normalizedEmail),
    index('persons_normalized_phone_idx').on(t.normalizedPhone),
    index('persons_name_idx').on(t.lastName, t.firstName),
    index('persons_merged_idx').on(t.mergedIntoPersonId),
  ],
);

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type PersonSource = NonNullable<Person['source']>;

/**
 * Materialised active-candidate role record. One-to-one with Person.
 * A Person becomes a Candidate through Lead activation (payment or manual override).
 */
export const candidateProfiles = pgTable('candidate_profiles', {
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
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt,
  updatedAt,
});

export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type NewCandidateProfile = typeof candidateProfiles.$inferInsert;
