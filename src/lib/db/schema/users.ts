import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
export type PortalInvitation = typeof portalInvitations.$inferSelect;
export type NewPortalInvitation = typeof portalInvitations.$inferInsert;
