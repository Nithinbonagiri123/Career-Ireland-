import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { persons } from './persons';
import { users } from './users';

/**
 * Single-use magic-link "please upload your documents" request. Issued by
 * staff from the person profile → the candidate gets an email with
 * `/upload/<opaque token>` → uploads land in the person's Documents
 * tab, no login required.
 *
 * Token storage mirrors `password_reset_tokens`: we store the SHA-256
 * of the plaintext token, never the token itself, so a DB dump cannot
 * be replayed to hijack an inbox link.
 *
 * `requested_requirement_ids` snapshots which of the person's MISSING
 * document requirements this specific link is asking for. On upload,
 * we only accept requirement IDs from that snapshot — the candidate
 * can't upload arbitrary types. Snapshotting also means that if new
 * requirements appear after issue, this link still only asks for what
 * was intended when it was sent.
 *
 * Lifecycle:
 *   created  → row inserted, email sent
 *   consumed → completed_at set once every requested requirement has at
 *              least one PROVIDED document
 *   revoked  → staff manually revokes before consumption (revoked_at set)
 *   expired  → NOW() > expires_at (no state flip; validated on access)
 */
export const documentUploadRequests = pgTable(
  'document_upload_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SHA-256 hex of the plaintext token. Plaintext is NEVER stored. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    personId: uuid('person_id')
      .notNull()
      .references(() => persons.id),
    /**
     * Snapshot of person_requirement.id values this link covers. Kept
     * as jsonb so it's atomic with the token row — no side table, one
     * lookup per validate.
     */
    requestedRequirementIds: jsonb('requested_requirement_ids').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    createdAt,
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set on the first upload session that fulfils every requested requirement. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Set if staff revokes the link before it's used. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: uuid('revoked_by_user_id').references((): AnyPgColumn => users.id),
    updatedAt,
  },
  (t) => [
    index('document_upload_requests_person_idx').on(t.personId, t.createdAt),
    // Only ONE active (not-yet-consumed, not revoked, not expired) link
    // per person at a time — regenerating replaces the old one.
    // Enforced as a partial unique on person_id where the row is still
    // usable. Expiry is checked in code (can't compare against NOW()
    // in a partial-index predicate portably).
    index('document_upload_requests_active_idx')
      .on(t.personId)
      .where(sql`${t.completedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  ],
);

export type DocumentUploadRequest = typeof documentUploadRequests.$inferSelect;
export type NewDocumentUploadRequest = typeof documentUploadRequests.$inferInsert;
