import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { users } from './users';

/**
 * Staff HR profile — extends users with department / position / reporting
 * relationship the same way candidateProfiles extends persons. Only
 * users with role ADMIN or STAFF get a profile; portal users
 * (CANDIDATE/EMPLOYER) do not.
 *
 * `status` is HR-specific ("ACTIVE / ON_LEAVE / TERMINATED") and is
 * distinct from `users.isActive` which is an auth-layer kill switch.
 * A user can be HR-ACTIVE but auth-INACTIVE if their account is
 * suspended pending investigation; the two are orthogonal.
 */
export const staffProfiles = pgTable(
  'staff_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references((): AnyPgColumn => users.id),
    department: varchar('department', { length: 120 }),
    position: varchar('position', { length: 120 }),
    joiningDate: date('joining_date'),
    /** Manager (also a users.id). NULL for the top of the reporting chain. */
    managerUserId: uuid('manager_user_id').references((): AnyPgColumn => users.id),
    status: text('status', { enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] })
      .notNull()
      .default('ACTIVE'),
    createdAt,
    updatedAt,
  },
  (t) => [index('staff_profiles_manager_idx').on(t.managerUserId)],
);

export type StaffProfile = typeof staffProfiles.$inferSelect;
export type NewStaffProfile = typeof staffProfiles.$inferInsert;

/**
 * Attendance session — one row per clock-in. `clockOutAt` stays NULL
 * while the session is active. All timestamps are server-side
 * (default NOW()) — the API refuses caller-provided values so a
 * malicious client cannot pre-date a session.
 *
 * Enforced invariants:
 *   1. At most one open session per user. Partial unique index on
 *      `user_id` WHERE `clock_out_at IS NULL`. Attempting a second
 *      insert while one is open fails with a UNIQUE violation, which
 *      the service maps to BusinessRuleError('ALREADY_CLOCKED_IN').
 *   2. clockOutAt must be strictly greater than clockInAt when set.
 *      CHECK constraint prevents impossible / negative sessions.
 *
 * `autoClosed` is set by the nightly cron for sessions left open
 * past a threshold — those rows show up on the admin dashboard as
 * "missing clock-out" so a human can correct them.
 *
 * `correctionReason` is set when an ADMIN edits a historical row via
 * the correction UI; every correction is also written to
 * `audit_events` with before/after, so this field is just the human-
 * readable summary attached to the row itself.
 */
export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    clockInAt: timestamp('clock_in_at', { withTimezone: true }).notNull().defaultNow(),
    clockInIp: varchar('clock_in_ip', { length: 64 }),
    clockOutAt: timestamp('clock_out_at', { withTimezone: true }),
    clockOutIp: varchar('clock_out_ip', { length: 64 }),
    autoClosed: boolean('auto_closed').notNull().default(false),
    correctionReason: text('correction_reason'),
    correctedByUserId: uuid('corrected_by_user_id').references((): AnyPgColumn => users.id),
    correctedAt: timestamp('corrected_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    /**
     * At most one open session per user — the workhorse constraint.
     * Two concurrent clock-in requests will race on this index; the
     * loser gets a UNIQUE violation the service catches and reports
     * as "already clocked in."
     */
    uniqueIndex('attendance_sessions_one_open_per_user')
      .on(t.userId)
      .where(sql`${t.clockOutAt} IS NULL`),
    index('attendance_sessions_user_idx').on(t.userId, t.clockInAt.desc()),
    index('attendance_sessions_clock_in_idx').on(t.clockInAt.desc()),
    /**
     * Impossible-timestamps guard: if clockOutAt is set, it must be
     * strictly after clockInAt. Prevents both zero-length sessions
     * (which are useless) and negative sessions (impossible).
     */
    check(
      'attendance_sessions_clock_out_after_in',
      sql`${t.clockOutAt} IS NULL OR ${t.clockOutAt} > ${t.clockInAt}`,
    ),
  ],
);

export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type NewAttendanceSession = typeof attendanceSessions.$inferInsert;
