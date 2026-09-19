import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { jobRequisitions } from './recruitment';
import { users } from './users';

/**
 * Per-candidate, per-requisition Work Permit Checklist — the internal
 * form Tracey fills in when a job offer is being finalised for a
 * specific applicant. Mirrors her paper "Document Checklist & Work
 * Permit Checklist" (see her PDF).
 *
 * Three logical sections, each stored as JSONB so the shape can evolve
 * without a migration (Tracey has already flagged that fields change
 * per client / country):
 *
 *   match_checks       {[key]: { value: 'YES'|'NO'|'NA'|null, note?: string }}
 *     - salary_match_advert, hours_match_advert, other_advert_match, all_info_on_advert
 *
 *   advert_info_checks {[key]: { value: 'YES'|'NO'|'NA'|null, note?: string }}
 *     - description_of_job, name_of_employer, min_annual_salary, location_of_employment, hours_of_work
 *
 *   documents_checks   {[doc_type_code]: { value: 'YES'|'NO'|'NA'|null, note?: string }}
 *     - CV, PASSPORT_BIOMETRIC, DRIVER_LICENCE_FB, DRIVER_LICENCE_LOE,
 *       POLICE_CLEARANCE, ..., matching the seeded doc types.
 *
 * One row per (requisition, person). Regenerate freely — the row is
 * updatable, not immutable like invoices.
 */
export const workPermitChecklists = pgTable(
  'work_permit_checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobRequisitionId: uuid('job_requisition_id')
      .notNull()
      .references(() => jobRequisitions.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),

    /** Contract sign date — "Date Contract Signed" on the PDF form. */
    contractSignedOn: date('contract_signed_on'),
    /** Commencement date — "Commencement Date" on the PDF. */
    commencementDate: date('commencement_date'),

    matchChecks: jsonb('match_checks').notNull().default(sql`'{}'::jsonb`),
    advertInfoChecks: jsonb('advert_info_checks').notNull().default(sql`'{}'::jsonb`),
    documentsChecks: jsonb('documents_checks').notNull().default(sql`'{}'::jsonb`),

    /** Free-text scratchpad — anything that doesn't fit the structured checks. */
    notes: text('notes'),

    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    updatedByUserId: uuid('updated_by_user_id').references((): AnyPgColumn => users.id),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Exactly one checklist per (requisition, person). Regenerate by
    // updating, not by inserting a second row.
    unique('work_permit_checklists_req_person_uniq').on(t.jobRequisitionId, t.personId),
    index('work_permit_checklists_req_idx').on(t.jobRequisitionId),
    index('work_permit_checklists_person_idx').on(t.personId),
  ],
);

export type WorkPermitChecklist = typeof workPermitChecklists.$inferSelect;
export type NewWorkPermitChecklist = typeof workPermitChecklists.$inferInsert;

/** JSONB value shape — one entry per check field. */
export type ChecklistAnswer = {
  value: 'YES' | 'NO' | 'NA' | null;
  note?: string;
};
