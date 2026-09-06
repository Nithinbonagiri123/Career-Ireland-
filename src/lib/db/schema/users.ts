import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { citext, createdAt, updatedAt } from './_shared';

/**
 * User accounts. Four roles:
 *   ADMIN     — full internal CRM access + user/portal management
 *   STAFF     — day-to-day internal CRM
 *   CANDIDATE — external portal, scoped to a single Person
 *   EMPLOYER  — external portal, scoped to a single Employer
 *
 * personId/employerId are set only for portal users. CHECK below enforces:
 *  - ADMIN/STAFF: neither set
 *  - CANDIDATE: personId set, employerId null
 *  - EMPLOYER: employerId set, personId null
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    role: text('role', { enum: ['ADMIN', 'STAFF', 'CANDIDATE', 'EMPLOYER'] })
      .notNull()
      .default('STAFF'),
    /** Set for role=CANDIDATE — the Person this portal user represents. FK added in a later migration to avoid cycles. */
    personId: uuid('person_id'),
    /** Set for role=EMPLOYER — the Employer this portal user represents. */
    employerId: uuid('employer_id'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    sessionsInvalidatedAfter: timestamp('sessions_invalidated_after', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (t) => [
    check('users_role_check', sql`${t.role} IN ('ADMIN','STAFF','CANDIDATE','EMPLOYER')`),
    check(
      'users_portal_scope_check',
      sql`(
        (${t.role} = 'ADMIN' AND ${t.personId} IS NULL AND ${t.employerId} IS NULL) OR
        (${t.role} = 'STAFF' AND ${t.personId} IS NULL AND ${t.employerId} IS NULL) OR
        (${t.role} = 'CANDIDATE' AND ${t.personId} IS NOT NULL AND ${t.employerId} IS NULL) OR
        (${t.role} = 'EMPLOYER' AND ${t.employerId} IS NOT NULL AND ${t.personId} IS NULL)
      )`,
    ),
  ],
);

export const portalInvitations = pgTable('portal_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 64 }).notNull().unique(),
  userType: text('user_type', { enum: ['CANDIDATE', 'EMPLOYER'] }).notNull(),
  personId: uuid('person_id'),
  employerId: uuid('employer_id'),
  email: citext('email').notNull(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references((): AnyPgColumn => users.id),
  createdAt,
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedUserId: uuid('accepted_user_id').references((): AnyPgColumn => users.id),
});

/**
 * Password reset tokens. The link sent by email contains the raw token; we
 * store only its SHA-256 hash so a DB dump cannot be replayed to reset accounts.
 *
 * Lifecycle: created on POST /login/forgot → consumed on POST /login/reset.
 * A used token has `usedAt` set; an expired token has `expiresAt < now()`.
 * Both are treated as invalid.
 *
 * Enumeration defence: the request endpoint always returns the same success
 * message regardless of whether the email matches a user, and the row is only
 * inserted when the email matches. requestedEmail is captured for rate-limiting
 * and audit; the userId is nullable because rows for unknown emails are never
 * inserted (rate-limit is enforced at a higher layer).
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SHA-256 hex of the token in the email link. The plaintext token is NEVER stored. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    /** Denormalised for rate-limiting queries; matches users.email at issue time. */
    requestedEmail: citext('requested_email').notNull(),
    /** IP that requested the reset. Used for rate-limiting + audit. */
    requestedIp: varchar('requested_ip', { length: 64 }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    /** Fixed 1-hour lifetime; short enough to limit exposure, long enough for real inbox latency. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the token is consumed. Reusing throws. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** IP that completed the reset — usually matches requestedIp; discrepancy is a signal. */
    usedIp: varchar('used_ip', { length: 64 }),
  },
  (t) => [
    index('password_reset_tokens_user_idx').on(t.userId, t.requestedAt),
    index('password_reset_tokens_email_idx').on(t.requestedEmail, t.requestedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
export type PortalInvitation = typeof portalInvitations.$inferSelect;
export type NewPortalInvitation = typeof portalInvitations.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
