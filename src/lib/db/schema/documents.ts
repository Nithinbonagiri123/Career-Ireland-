import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { employers } from './recruitment';
import { documentTypes } from './reference';
import { users } from './users';

/**
 * Configurable requirement rules: "which document types are required in which context".
 * scope=GLOBAL means required for everyone; other scopes attach the rule to a specific
 * occupation / job requisition / service package via scopeRefId.
 */
export const documentRequirementRules = pgTable(
  'document_requirement_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentTypes.id),
    scope: text('scope', {
      enum: ['OCCUPATION', 'JOB_REQUISITION', 'SERVICE_PACKAGE', 'GLOBAL'],
    }).notNull(),
    /** NULL when scope=GLOBAL; otherwise the id of the occupation / requisition / package. */
    scopeRefId: uuid('scope_ref_id'),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('doc_req_rules_type_scope_unique').on(t.documentTypeId, t.scope, t.scopeRefId),
    check(
      'doc_req_rules_scope_ref_consistent',
      sql`(${t.scope} = 'GLOBAL' AND ${t.scopeRefId} IS NULL) OR
          (${t.scope} <> 'GLOBAL' AND ${t.scopeRefId} IS NOT NULL)`,
    ),
    index('doc_req_rules_scope_idx').on(t.scope, t.scopeRefId),
  ],
);

/**
 * Materialised per-person requirement — the "TODO list" of docs a candidate must supply.
 * Populated by rules but can be added manually per-candidate (candidateSpecific=true).
 */
export const candidateDocumentRequirements = pgTable(
  'candidate_document_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentTypes.id),
    status: text('status', {
      enum: ['MISSING', 'PROVIDED', 'ACCEPTED', 'REJECTED'],
    })
      .notNull()
      .default('MISSING'),
    sourceRuleId: uuid('source_rule_id').references(() => documentRequirementRules.id),
    notes: text('notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('cand_doc_req_person_type_unique').on(t.personId, t.documentTypeId),
    index('cand_doc_req_status_idx').on(t.status),
  ],
);

/**
 * One row per uploaded file (versioned per person+type by explicit `version` field).
 * S3 stores the binary; PostgreSQL stores only metadata.
 * CHECK: exactly one of ownerPersonId / ownerEmployerId is set.
 */
export const documentInstances = pgTable(
  'document_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerPersonId: uuid('owner_person_id').references(() => persons.id),
    ownerEmployerId: uuid('owner_employer_id').references(() => employers.id),
    documentTypeId: uuid('document_type_id')
      .notNull()
      .references(() => documentTypes.id),
    version: integer('version').notNull().default(1),
    status: text('status', {
      enum: ['UPLOADED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
    })
      .notNull()
      .default('UPLOADED'),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    s3Bucket: varchar('s3_bucket', { length: 120 }).notNull(),
    s3ObjectKey: varchar('s3_object_key', { length: 500 }).notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresOn: date('expires_on'),
    reviewNotes: text('review_notes'),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'document_instances_owner_xor',
      sql`(${t.ownerPersonId} IS NOT NULL) <> (${t.ownerEmployerId} IS NOT NULL)`,
    ),
    index('document_instances_owner_person_idx').on(t.ownerPersonId, t.documentTypeId),
    index('document_instances_owner_employer_idx').on(t.ownerEmployerId, t.documentTypeId),
    index('document_instances_status_idx').on(t.status),
    index('document_instances_expiry_idx').on(t.expiresOn),
  ],
);

/** Which document instance(s) fulfil which requirement. Many:many. */
export const documentRequirementFulfillments = pgTable(
  'document_requirement_fulfillments',
  {
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => candidateDocumentRequirements.id),
    documentInstanceId: uuid('document_instance_id')
      .notNull()
      .references(() => documentInstances.id),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }).notNull().defaultNow(),
    fulfilledByUserId: uuid('fulfilled_by_user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.requirementId, t.documentInstanceId] })],
);

export type DocumentRequirementRule = typeof documentRequirementRules.$inferSelect;
export type NewDocumentRequirementRule = typeof documentRequirementRules.$inferInsert;
export type CandidateDocumentRequirement = typeof candidateDocumentRequirements.$inferSelect;
export type NewCandidateDocumentRequirement = typeof candidateDocumentRequirements.$inferInsert;
export type DocumentInstance = typeof documentInstances.$inferSelect;
export type NewDocumentInstance = typeof documentInstances.$inferInsert;
export type DocumentRequirementFulfillment = typeof documentRequirementFulfillments.$inferSelect;
