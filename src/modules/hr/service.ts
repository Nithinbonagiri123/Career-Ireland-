import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole, requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type AttendanceSession,
  attendanceSessions,
  type StaffProfile,
  staffProfiles,
} from '@/lib/db/schema/hr';
import { users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type CorrectAttendanceInput,
  CorrectAttendanceSchema,
  type UpsertStaffProfileInput,
  UpsertStaffProfileSchema,
} from './schemas';

/**
 * All attendance timestamps are server-generated. `NOW()` is captured
 * inside a transaction so a concurrent clock-in from the same user
 * still races on the partial unique index rather than on a caller-
 * supplied timestamp.
 *
 * Correction endpoints accept explicit timestamps because by
 * definition an admin is entering the true value after the fact — but
 * every correction is audit-logged with before/after so the change is
 * traceable.
 */

// ─── Constants ──────────────────────────────────────────────────────

/** Minutes after the shift start after which a session is flagged "late". */
const LATE_THRESHOLD_MINUTES = 15;
/** Notional shift-start local time, used only for the "late" indicator. */
const SHIFT_START_HOUR = 9;

// ─── Read helpers ───────────────────────────────────────────────────

export async function findOpenSessionForUser(userId: string): Promise<AttendanceSession | null> {
  const [row] = await db
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.userId, userId), isNull(attendanceSessions.clockOutAt)))
    .limit(1);
  return row ?? null;
}

export async function fetchMyRecentSessions(
  userId: string,
  limit = 20,
): Promise<AttendanceSession[]> {
  return db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.userId, userId))
    .orderBy(desc(attendanceSessions.clockInAt))
    .limit(limit);
}

export type AttendanceRow = {
  session: AttendanceSession;
  userName: string;
  userEmail: string;
};

export async function fetchTodayAttendance(): Promise<AttendanceRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      session: attendanceSessions,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(attendanceSessions)
    .innerJoin(users, eq(users.id, attendanceSessions.userId))
    .where(gte(attendanceSessions.clockInAt, startOfDay))
    .orderBy(desc(attendanceSessions.clockInAt));
  return rows;
}

export async function fetchRecentAttendance(limit = 50): Promise<AttendanceRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      session: attendanceSessions,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(attendanceSessions)
    .innerJoin(users, eq(users.id, attendanceSessions.userId))
    .orderBy(desc(attendanceSessions.clockInAt))
    .limit(limit);
  return rows;
}

export type StaffDirectoryRow = {
  profile: StaffProfile;
  userName: string;
  userEmail: string;
  managerName: string | null;
};

/**
 * Direct reports for a given manager, joined with each report's
 * latest attendance session (open or closed). Used by /hr/team so
 * managers can see who's clocked in right now, who's late, and who
 * has missing clock-outs — but scoped to just their reports, not
 * the whole team.
 */
export type TeamReportRow = {
  userId: string;
  userName: string;
  userEmail: string;
  latestSession: AttendanceSession | null;
};

export async function fetchDirectReports(managerUserId: string): Promise<TeamReportRow[]> {
  // Everyone whose staff_profile.manager_user_id points at me.
  const reportRows = await db
    .select({
      userId: users.id,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .where(eq(staffProfiles.managerUserId, managerUserId))
    .orderBy(users.fullName);
  if (reportRows.length === 0) return [];

  // For each report, fetch their latest attendance session (open or
  // most recent). One SQL per report is fine at team scale — a real
  // manager has <30 direct reports.
  const enriched = await Promise.all(
    reportRows.map(async (r) => {
      const [latest] = await db
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.userId, r.userId))
        .orderBy(desc(attendanceSessions.clockInAt))
        .limit(1);
      return {
        ...r,
        latestSession: latest ?? null,
      };
    }),
  );
  return enriched;
}

export async function fetchStaffDirectory(): Promise<StaffDirectoryRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  // Alias join for manager. Drizzle needs an alias when joining the
  // same table twice — use raw SQL for the manager LEFT JOIN.
  const rows = await db
    .select({
      profile: staffProfiles,
      userName: users.fullName,
      userEmail: users.email,
      managerName: sql<string | null>`manager.full_name`,
    })
    .from(staffProfiles)
    .innerJoin(users, eq(users.id, staffProfiles.userId))
    .leftJoin(sql`${users} manager`, sql`manager.id = ${staffProfiles.managerUserId}`)
    .orderBy(users.fullName);
  return rows;
}

export type HrDashboard = {
  currentlyClockedIn: number;
  todayTotal: number;
  missingClockOuts: number;
  lateToday: number;
};

export async function fetchHrDashboard(): Promise<HrDashboard> {
  await requireRole(['ADMIN', 'STAFF']);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const shiftStartToday = new Date();
  shiftStartToday.setHours(SHIFT_START_HOUR, LATE_THRESHOLD_MINUTES, 0, 0);

  const [openNow, today, stillOpen, late] = await Promise.all([
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(attendanceSessions)
      .where(isNull(attendanceSessions.clockOutAt))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(attendanceSessions)
      .where(gte(attendanceSessions.clockInAt, startOfDay))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(attendanceSessions)
      .where(
        and(isNull(attendanceSessions.clockOutAt), lt(attendanceSessions.clockInAt, yesterday)),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(attendanceSessions)
      .where(
        and(
          gte(attendanceSessions.clockInAt, startOfDay),
          sql`${attendanceSessions.clockInAt} > ${shiftStartToday.toISOString()}`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),
  ]);

  return {
    currentlyClockedIn: openNow,
    todayTotal: today,
    missingClockOuts: stillOpen,
    lateToday: late,
  };
}

// ─── Mutations ──────────────────────────────────────────────────────

/**
 * Insert a new clock-in row. Every timestamp is server-side. The
 * partial unique index on `user_id WHERE clock_out_at IS NULL`
 * enforces "at most one open session" — a concurrent second call
 * races on the index and loses with a UNIQUE violation, which we map
 * to a friendly BusinessRuleError.
 */
export async function clockIn(ip: string | null): Promise<AttendanceSession> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    let inserted: AttendanceSession | undefined;
    try {
      const [row] = await tx
        .insert(attendanceSessions)
        .values({ userId: session.user.id, clockInIp: ip })
        .returning();
      inserted = row;
    } catch (err) {
      // Postgres error code 23505 = unique_violation. The only unique
      // index in play here is the "one open per user" partial index.
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        throw new BusinessRuleError(
          'ALREADY_CLOCKED_IN',
          'You are already clocked in. Clock out of your current session before starting a new one.',
        );
      }
      throw err;
    }
    if (!inserted) throw new Error('attendance insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'attendance_session',
      entityId: inserted.id,
      action: 'CREATED',
      after: { clockInAt: inserted.clockInAt.toISOString() },
      context: ip ? { ip } : undefined,
    });

    return inserted;
  });
}

/**
 * Close the caller's currently open session. Uses a single UPDATE
 * guarded by `clockOutAt IS NULL` so a race between two clock-out
 * requests never accidentally closes the same session twice.
 */
export async function clockOut(ip: string | null): Promise<AttendanceSession> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(attendanceSessions)
      .where(
        and(eq(attendanceSessions.userId, session.user.id), isNull(attendanceSessions.clockOutAt)),
      )
      .for('update')
      .limit(1);
    if (!before) {
      throw new BusinessRuleError(
        'NOT_CLOCKED_IN',
        'You are not currently clocked in. Clock in first.',
      );
    }
    const [after] = await tx
      .update(attendanceSessions)
      .set({
        clockOutAt: sql`NOW()`,
        clockOutIp: ip,
        updatedAt: sql`NOW()`,
      })
      .where(and(eq(attendanceSessions.id, before.id), isNull(attendanceSessions.clockOutAt)))
      .returning();
    if (!after) throw new Error('attendance update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'attendance_session',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { clockOutAt: null },
      after: { clockOutAt: after.clockOutAt?.toISOString() ?? null },
      context: ip ? { ip } : undefined,
    });

    return after;
  });
}

/**
 * Correct a historical attendance row. ADMIN only — the audit trail
 * captures the previous + new values plus the human-readable reason.
 */
export async function correctAttendance(input: CorrectAttendanceInput): Promise<AttendanceSession> {
  const session = await requireRole(['ADMIN']);
  const parsed = CorrectAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid correction',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, d.sessionId))
      .for('update')
      .limit(1);
    if (!before) {
      throw new BusinessRuleError('SESSION_NOT_FOUND', 'Attendance session not found.');
    }

    const clockInAt = d.clockInAt ? new Date(d.clockInAt) : before.clockInAt;
    const clockOutAt =
      d.clockOutAt === undefined
        ? before.clockOutAt
        : d.clockOutAt === null
          ? null
          : new Date(d.clockOutAt);
    if (clockOutAt && clockOutAt <= clockInAt) {
      throw new ValidationError('Clock-out must be after clock-in.', {
        clockOutAt: 'Must be strictly after clockInAt.',
      });
    }

    const [after] = await tx
      .update(attendanceSessions)
      .set({
        clockInAt,
        clockOutAt,
        correctionReason: d.reason,
        correctedByUserId: session.user.id,
        correctedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(attendanceSessions.id, d.sessionId))
      .returning();
    if (!after) throw new Error('attendance correction returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'attendance_session',
      entityId: after.id,
      action: 'UPDATED',
      before: {
        clockInAt: before.clockInAt.toISOString(),
        clockOutAt: before.clockOutAt?.toISOString() ?? null,
      },
      after: {
        clockInAt: after.clockInAt.toISOString(),
        clockOutAt: after.clockOutAt?.toISOString() ?? null,
      },
      context: { reason: d.reason },
    });

    return after;
  });
}

/**
 * Sessions left open past this many hours are auto-closed by the
 * nightly cron. 14h covers the longest reasonable single shift + a
 * safety margin; staff who legitimately worked longer can have their
 * row corrected by an admin the next day.
 */
export const ATTENDANCE_AUTO_CLOSE_HOURS = 14;

/**
 * Cron entry point — finds every open session whose clock-in was more
 * than ATTENDANCE_AUTO_CLOSE_HOURS ago and closes it at
 * `clockInAt + ATTENDANCE_AUTO_CLOSE_HOURS`. Each closure is audit-
 * logged so the admin correction UI can find them later.
 *
 * The service is called by the cron endpoint only — no requireRole
 * check here, exactly like cleanUpStaleDrafts. The endpoint verifies
 * CRON_SECRET before invoking.
 */
export async function autoCloseStaleAttendance(): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - ATTENDANCE_AUTO_CLOSE_HOURS * 60 * 60 * 1000);
  return db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: attendanceSessions.id, clockInAt: attendanceSessions.clockInAt })
      .from(attendanceSessions)
      .where(and(isNull(attendanceSessions.clockOutAt), lt(attendanceSessions.clockInAt, cutoff)));
    if (stale.length === 0) return { closed: 0 };

    for (const row of stale) {
      const clockOutAt = new Date(
        row.clockInAt.getTime() + ATTENDANCE_AUTO_CLOSE_HOURS * 60 * 60 * 1000,
      );
      await tx
        .update(attendanceSessions)
        .set({
          clockOutAt,
          autoClosed: true,
          updatedAt: sql`NOW()`,
        })
        .where(eq(attendanceSessions.id, row.id));
      await recordAudit(tx, {
        actorUserId: null,
        entityType: 'attendance_session',
        entityId: row.id,
        action: 'STATUS_CHANGED',
        before: { clockOutAt: null, autoClosed: false },
        after: { clockOutAt: clockOutAt.toISOString(), autoClosed: true },
        context: {
          reason: `auto-closed after ${ATTENDANCE_AUTO_CLOSE_HOURS}h open`,
          cron: 'attendance-auto-close',
        },
      });
    }

    return { closed: stale.length };
  });
}

/** Upsert a staff profile — used by the admin staff directory. */
export async function upsertStaffProfile(input: UpsertStaffProfileInput): Promise<StaffProfile> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertStaffProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid staff profile',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, d.userId))
      .limit(1);

    if (existing) {
      const [row] = await tx
        .update(staffProfiles)
        .set({
          department: d.department ?? existing.department,
          position: d.position ?? existing.position,
          joiningDate: d.joiningDate ?? existing.joiningDate,
          managerUserId: d.managerUserId === undefined ? existing.managerUserId : d.managerUserId,
          status: d.status ?? existing.status,
          updatedAt: sql`NOW()`,
        })
        .where(eq(staffProfiles.id, existing.id))
        .returning();
      if (!row) throw new Error('staff profile update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'staff_profile',
        entityId: row.id,
        action: 'UPDATED',
        before: existing,
        after: row,
      });
      return row;
    }

    const [row] = await tx
      .insert(staffProfiles)
      .values({
        userId: d.userId,
        department: d.department,
        position: d.position,
        joiningDate: d.joiningDate,
        managerUserId: d.managerUserId ?? null,
        status: d.status ?? 'ACTIVE',
      })
      .returning();
    if (!row) throw new Error('staff profile insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'staff_profile',
      entityId: row.id,
      action: 'CREATED',
      after: row,
    });
    return row;
  });
}
