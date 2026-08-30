import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { qualifications, skills } from './reference';

/** Skills a candidate has, with proficiency and experience. Enables structured matching. */
export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id),
    proficiency: text('proficiency', {
      enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'],
    })
      .notNull()
      .default('INTERMEDIATE'),
    yearsExperience: integer('years_experience'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('candidate_skills_person_skill_unique').on(t.personId, t.skillId),
    index('candidate_skills_person_idx').on(t.personId),
    index('candidate_skills_skill_idx').on(t.skillId),
  ],
);

/** Qualifications a candidate holds. */
export const candidateQualifications = pgTable(
  'candidate_qualifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    qualificationId: uuid('qualification_id')
      .notNull()
      .references(() => qualifications.id),
    awardedOn: date('awarded_on'),
    institution: varchar('institution', { length: 200 }),
    referenceNumber: varchar('reference_number', { length: 120 }),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('candidate_quals_person_qual_unique').on(t.personId, t.qualificationId),
    index('candidate_quals_person_idx').on(t.personId),
  ],
);

/**
 * Free-text employment history — past employers are unrelated to the `employers` table
 * (which is for client-employer relationships, not the candidate's prior jobs).
 */
export const employmentHistory = pgTable(
  'employment_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    employerName: varchar('employer_name', { length: 200 }).notNull(),
    jobTitle: varchar('job_title', { length: 200 }),
    location: varchar('location', { length: 200 }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    isCurrent: boolean('is_current').notNull().default(false),
    description: text('description'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('employment_history_person_idx').on(t.personId),
    check(
      'employment_history_dates_ordered',
      sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    check('employment_history_current_no_end', sql`${t.isCurrent} = false OR ${t.endDate} IS NULL`),
  ],
);

export type CandidateSkill = typeof candidateSkills.$inferSelect;
export type NewCandidateSkill = typeof candidateSkills.$inferInsert;
export type CandidateQualification = typeof candidateQualifications.$inferSelect;
export type NewCandidateQualification = typeof candidateQualifications.$inferInsert;
export type EmploymentHistory = typeof employmentHistory.$inferSelect;
export type NewEmploymentHistory = typeof employmentHistory.$inferInsert;
