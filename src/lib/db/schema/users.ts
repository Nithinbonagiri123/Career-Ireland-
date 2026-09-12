import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
    /**
     * Roles:
     *   ADMIN                 — full internal CRM access + user management
     *   STAFF                 — generic internal user; retained as a
     *                           permissive default for existing rows
     *   MANAGER               — internal user with team-scoped views
     *                           (see /hr/team, and eventually assigned-
     *                           candidate scoping)
     *   RECRUITER             — internal user focused on recruitment
     *   DOCUMENT_SPECIALIST   — internal user focused on candidate docs
     *   FINANCE               — internal user with payment + invoice
     *                           mutation rights (verify, void, refund)
     *   CANDIDATE / EMPLOYER  — portal-only, scoped to a Person / Employer
     */
    role: text('role', {
      enum: [
        'ADMIN',
        'STAFF',
        'MANAGER',
        'RECRUITER',
        'DOCUMENT_SPECIALIST',
        'FINANCE',
        'CANDIDATE',
        'EMPLOYER',
      ],
    })
      .notNull()
      .default('STAFF'),
    /** Set for role=CANDIDATE — the Person this portal user represents. FK added in a later migration to avoid cycles. */
    personId: uuid('person_id'),
    /** Set for role=EMPLOYER — the Employer this portal user represents. */
    employerId: uuid('employer_id'),
    isActive: boolean('is_active').notNull().default(true),
    /**
     * Business owner flag. The owner bypasses every permission check
     * — they always have every verb on every module. Exactly one user
     * can be owner at a time (partial unique index below). Set via
     * `pnpm tsx scripts/set-owner.ts <email>` — there is deliberately
     * no in-app UI, since transferring ownership needs a human
     * decision on the DB side.
     */
    isOwner: boolean('is_owner').notNull().default(false),
    /**
     * Which workspace this user was last using — informs the landing
     * page after login. Values: 'main' | 'candidate_services' |
     * 'recruitment' | 'immigration'. Free-form text so adding a new
     * workspace is a code-only change.
     */
    currentWorkspace: text('current_workspace'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    sessionsInvalidatedAfter: timestamp('sessions_invalidated_after', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt,
    updatedAt,
  },
  (t) => [
    check(
      'users_role_check',
      sql`${t.role} IN ('ADMIN','STAFF','MANAGER','RECRUITER','DOCUMENT_SPECIALIST','FINANCE','CANDIDATE','EMPLOYER')`,
    ),
    check(
      'users_portal_scope_check',
      sql`(
        (${t.role} IN ('ADMIN','STAFF','MANAGER','RECRUITER','DOCUMENT_SPECIALIST','FINANCE') AND ${t.personId} IS NULL AND ${t.employerId} IS NULL) OR
        (${t.role} = 'CANDIDATE' AND ${t.personId} IS NOT NULL AND ${t.employerId} IS NULL) OR
        (${t.role} = 'EMPLOYER' AND ${t.employerId} IS NOT NULL AND ${t.personId} IS NULL)
      )`,
    ),
    // At most one owner in the whole DB.
    uniqueIndex('users_single_owner').on(t.isOwner).where(sql`${t.isOwner} = true`),
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

/**
 * Rate-limiting ledger for the login endpoint. Every credential submission
 * (successful or not) writes one row; the throttle checks failures per email
 * and per IP inside a sliding window. Kept append-only for audit; a nightly
 * cron can prune old rows outside the window if the table grows.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull(),
    ip: varchar('ip', { length: 64 }),
    outcome: text('outcome', { enum: ['SUCCESS', 'FAILURE'] }).notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_email_idx').on(t.email, t.attemptedAt),
    index('login_attempts_ip_idx').on(t.ip, t.attemptedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
export type PortalInvitation = typeof portalInvitations.$inferSelect;
export type NewPortalInvitation = typeof portalInvitations.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
