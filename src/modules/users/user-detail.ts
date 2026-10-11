import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { attendanceSessions, type StaffProfile, staffProfiles } from '@/lib/db/schema/hr';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import type { User } from '@/lib/db/schema/users';
import { findUserById } from './repository';

/**
 * Phase 4 blueprint §9.2 — one-shot data loader for the Employee detail
 * page `/admin/users/[id]`. Groups everything the page needs:
 *
 *   - the user row (profile, role, active flag)
 *   - optional HR staff profile (department, position, manager, join date)
 *   - assigned-work counts across candidates / employers / requisitions /
 *     immigration cases (open counts only — closed/terminal rows aren't
 *     "work to do", so excluding them keeps the signal clean)
 *   - last N attendance sessions
 *
 * Returns null when the user doesn't exist so the caller can `notFound()`.
 * Admin-gated via requireRole so we can safely surface role + active state.
 */
export type EmployeeDetail = {
  user: User;
  staffProfile: StaffProfile | null;
  assignedCounts: {
    candidates: number;
    employers: number;
    requisitions: number;
    immigrationCases: number;
  };
  recentAttendance: Array<{
    id: string;
    clockInAt: Date;
    clockOutAt: Date | null;
  }>;
  lastSevenDaysMinutes: number;
};

export async function fetchEmployeeDetail(userId: string): Promise<EmployeeDetail | null> {
  await requireRole(['ADMIN']);
  const user = await findUserById(userId);
  if (!user) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    [profile],
    [candidatesRow],
    [employersRow],
    [requisitionsRow],
    [immigrationRow],
    recentSessions,
    [minutesRow],
  ] = await Promise.all([
    db.select().from(staffProfiles).where(eq(staffProfiles.userId, userId)).limit(1),
    // Candidates = candidate_profiles rows (the materialised recruiter-
    // facing role attached to a person). Exclude ARCHIVED lifecycle
    // so only live work shows up.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.assignedUserId, userId),
          sql`${candidateProfiles.lifecycleStatus} <> 'ARCHIVED'`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(employers)
      .where(and(eq(employers.assignedUserId, userId), isNull(employers.archivedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobRequisitions)
      .where(
        and(
          eq(jobRequisitions.assignedUserId, userId),
          // Terminal / archived states aren't work to do.
          sql`${jobRequisitions.status} NOT IN ('FILLED', 'CLOSED', 'CANCELLED')`,
          isNull(jobRequisitions.archivedAt),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(immigrationCases)
      .where(
        and(
          eq(immigrationCases.assignedUserId, userId),
          // Terminal immigration-case statuses from the schema enum.
          sql`${immigrationCases.status} NOT IN ('APPROVED', 'REJECTED', 'CLOSED')`,
        ),
      ),
    db
      .select({
        id: attendanceSessions.id,
        clockInAt: attendanceSessions.clockInAt,
        clockOutAt: attendanceSessions.clockOutAt,
      })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.userId, userId))
      .orderBy(desc(attendanceSessions.clockInAt))
      .limit(10),
    // Sum of minutes clocked in the last 7 days — closed sessions only
    // (an open session is counted on the ticker, not here).
    db
      .select({
        minutes: sql<number>`
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (${attendanceSessions.clockOutAt} - ${attendanceSessions.clockInAt})) / 60
          ), 0)::int
        `,
      })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.userId, userId),
          gte(attendanceSessions.clockInAt, sevenDaysAgo),
          sql`${attendanceSessions.clockOutAt} IS NOT NULL`,
        ),
      ),
  ]);

  return {
    user,
    staffProfile: profile ?? null,
    assignedCounts: {
      candidates: candidatesRow?.n ?? 0,
      employers: employersRow?.n ?? 0,
      requisitions: requisitionsRow?.n ?? 0,
      immigrationCases: immigrationRow?.n ?? 0,
    },
    recentAttendance: recentSessions,
    lastSevenDaysMinutes: minutesRow?.minutes ?? 0,
  };
}
