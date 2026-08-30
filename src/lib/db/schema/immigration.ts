import {
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { serviceEngagements } from './commerce';
import { documentInstances } from './documents';
import { persons } from './persons';
import { employers, jobRequisitions, placements } from './recruitment';
import { documentTypes } from './reference';
import { users } from './users';

/**
 * Immigration cases — one entity, discriminated by case_type.
 * Independent capability: not required to reference a Placement (Scenario B).
 */
export const immigrationCases = pgTable(
  'immigration_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseType: text('case_type', {
      enum: ['EMPLOYMENT_PERMIT', 'VISA', 'VISA_EXTENSION'],
    }).notNull(),
    beneficiaryPersonId: uuid('beneficiary_person_id')
      .notNull()
      .references(() => persons.id),
    sponsorEmployerId: uuid('sponsor_employer_id').references(() => employers.id),
    relatedPlacementId: uuid('related_placement_id').references(() => placements.id),
    relatedJobRequisitionId: uuid('related_job_requisition_id').references(
      () => jobRequisitions.id,
    ),
    serviceEngagementId: uuid('service_engagement_id').references(() => serviceEngagements.id),
    status: text('status', {
      enum: [
        'OPEN',
        'DOCUMENTS_PENDING',
        'SUBMITTED',
        'UNDER_AUTHORITY_REVIEW',
        'APPROVED',
        'REJECTED',
        'CLOSED',
      ],
    })
      .notNull()
      .default('OPEN'),
    authorityReference: varchar('authority_reference', { length: 120 }),
    submittedAt: date('submitted_at'),
    decisionAt: date('decision_at'),
    expiresOn: date('expires_on'),
    /** Staff member responsible for driving this case. NULL = unassigned. */
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('immigration_cases_beneficiary_type_idx').on(t.beneficiaryPersonId, t.caseType),
    index('immigration_cases_sponsor_idx').on(t.sponsorEmployerId),
    index('immigration_cases_status_idx').on(t.status),
    index('immigration_cases_expires_idx').on(t.expiresOn),
    index('immigration_cases_assigned_idx').on(t.assignedUserId),
  ],
);

/**
 * Checklist of documents required for a specific immigration case (e.g. passport,
 * medical, police clearance for a work permit application).
 */
export const immigrationCaseDocumentRequirements = pgTable(
  'immigration_case_document_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    immigrationCaseId: uuid('immigration_case_id')
      .notNull()
      .references(() => immigrationCases.id, { onDelete: 'cascade' }),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentTypes.id),
    status: text('status', {
      enum: ['MISSING', 'PROVIDED', 'ACCEPTED', 'REJECTED'],
    })
      .notNull()
      .default('MISSING'),
    isMandatory: text('is_mandatory', { enum: ['MANDATORY', 'OPTIONAL'] })
      .notNull()
      .default('MANDATORY'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('imm_case_doc_req_case_type_unique').on(t.immigrationCaseId, t.documentTypeId),
    index('imm_case_doc_req_status_idx').on(t.status),
  ],
);

/**
 * Join between an immigration case and the document instances attached to it.
 * A single document (passport) can satisfy multiple cases (visa + extension).
 */
export const immigrationCaseDocuments = pgTable(
  'immigration_case_documents',
  {
    immigrationCaseId: uuid('immigration_case_id')
      .notNull()
      .references(() => immigrationCases.id, { onDelete: 'cascade' }),
    documentInstanceId: uuid('document_instance_id')
      .notNull()
      .references(() => documentInstances.id),
    caseRequirementId: uuid('case_requirement_id').references(
      () => immigrationCaseDocumentRequirements.id,
    ),
    attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
    attachedByUserId: uuid('attached_by_user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.immigrationCaseId, t.documentInstanceId] }),
    index('imm_case_docs_document_idx').on(t.documentInstanceId),
  ],
);

export type ImmigrationCase = typeof immigrationCases.$inferSelect;
export type NewImmigrationCase = typeof immigrationCases.$inferInsert;
export type ImmigrationCaseDocumentRequirement =
  typeof immigrationCaseDocumentRequirements.$inferSelect;
export type NewImmigrationCaseDocumentRequirement =
  typeof immigrationCaseDocumentRequirements.$inferInsert;
export type ImmigrationCaseDocument = typeof immigrationCaseDocuments.$inferSelect;
export type NewImmigrationCaseDocument = typeof immigrationCaseDocuments.$inferInsert;
