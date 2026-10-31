import { e2eAdminId } from './owner';

/**
 * HR Stage 6G — deterministic attendance records for browser tests and
 * before/after screenshots. The local dev data has no staff profiles and
 * only a handful of zero-length sessions.
 *
 * Seeds, all tagged "Hrfix <Name> <stamp>":
 *  - five throwaway STAFF users (unusable password hash — they cannot log
 *    in) with staff profiles reporting to the E2E admin, so the admin's
 *    /hr/team shows them as direct reports;
 *  - attendance across every state: working now, on an open break, closed
 *    today with a break, a corrected session (by the admin, with reason),
 *    an auto-closed session, a session open since yesterday (missing
 *    clock-out), and closed history over the past week.
 *
 * Rows are inserted directly and satisfy the table constraints (one open
 * session per user, clock-out after clock-in, one open break per session,
 * break end after start). No sessions are created for the E2E admin or
 * staff users. `cleanup()` removes exactly these rows.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function mods() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { inArray, or } = await import('drizzle-orm');
  const { db } = await import('../../src/lib/db/client');
  const { users } = await import('../../src/lib/db/schema/users');
  const hr = await import('../../src/lib/db/schema/hr');
  const { auditEvents } = await import('../../src/lib/db/schema/audit_events');
  return { db, inArray, or, users, auditEvents, ...hr };
}

export type HrScenario = Awaited<ReturnType<typeof seedHrScenario>>;

export async function seedHrScenario() {
  const m = await mods();
  const admin = await e2eAdminId();
  const tag = Math.random().toString(36).slice(2, 7);
  const now = Date.now();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  // "Earlier today" that is still today even just after midnight.
  const sinceMidnight = now - todayStart.getTime();
  const todayAt = (fraction: number) =>
    new Date(todayStart.getTime() + Math.max(60_000, sinceMidnight * fraction));
  const daysAgo = (d: number, hour: number, minute = 0) => {
    const x = new Date(todayStart.getTime() - d * DAY);
    x.setHours(hour, minute, 0, 0);
    return x;
  };

  const people = [
    { key: 'working', first: 'Aoife', department: 'Recruitment', position: 'Recruiter' },
    { key: 'onBreak', first: 'Brian', department: 'Candidate Services', position: 'Advisor' },
    { key: 'doneToday', first: 'Ciara', department: 'Immigration', position: 'Case Officer' },
    { key: 'missing', first: 'Declan', department: 'Finance', position: 'Accounts Assistant' },
    {
      key: 'onLeave',
      first: 'Eimear',
      department: 'Operations',
      position: 'Office Manager',
      status: 'ON_LEAVE' as const,
    },
  ] as const;

  const ids: Record<string, string> = {};
  const names: Record<string, string> = {};
  const sessionIds: string[] = [];

  await m.db.transaction(async (tx) => {
    for (const [i, p] of people.entries()) {
      const fullName = `Hrfix ${p.first} ${tag}`;
      const [u] = await tx
        .insert(m.users)
        .values({
          email: `hrfix-${p.first.toLowerCase()}-${tag}@example.test`,
          passwordHash: 'not-a-login',
          fullName,
          role: 'STAFF',
        })
        .returning({ id: m.users.id });
      if (!u) throw new Error('seed user failed');
      ids[p.key] = u.id;
      names[p.key] = fullName;
      await tx.insert(m.staffProfiles).values({
        userId: u.id,
        department: p.department,
        position: p.position,
        joiningDate: new Date(now - (200 + i * 90) * DAY).toISOString().slice(0, 10),
        managerUserId: admin,
        status: 'status' in p ? p.status : 'ACTIVE',
      });
    }

    const session = async (v: {
      userId: string;
      clockInAt: Date;
      clockOutAt?: Date | null;
      autoClosed?: boolean;
      correctionReason?: string;
      correctedByUserId?: string;
      correctedAt?: Date;
    }) => {
      const [row] = await tx
        .insert(m.attendanceSessions)
        .values({ ...v, clockOutAt: v.clockOutAt ?? null })
        .returning({ id: m.attendanceSessions.id });
      if (!row) throw new Error('seed session failed');
      sessionIds.push(row.id);
      return row.id;
    };
    const brk = async (attendanceSessionId: string, start: Date, end: Date | null) => {
      await tx.insert(m.attendanceBreakSessions).values({
        attendanceSessionId,
        breakStartedAt: start,
        breakEndedAt: end,
        durationMinutes: end
          ? String(Math.round((end.getTime() - start.getTime()) / 60_000))
          : null,
      });
    };

    // History for everyone: closed sessions on the previous working days.
    for (const key of ['working', 'onBreak', 'doneToday', 'missing', 'onLeave']) {
      for (const d of [2, 4, 6]) {
        const id = await session({
          userId: ids[key] as string,
          clockInAt: daysAgo(d, 9, 5 + d),
          clockOutAt: daysAgo(d, 17, 30),
        });
        await brk(id, daysAgo(d, 13, 0), daysAgo(d, 13, 40));
      }
    }

    // Working now (clocked in earlier today, no break open).
    const w = await session({ userId: ids.working as string, clockInAt: todayAt(0.4) });
    await brk(w, todayAt(0.6), todayAt(0.7));

    // On an open break right now.
    const b = await session({ userId: ids.onBreak as string, clockInAt: todayAt(0.3) });
    await brk(b, todayAt(0.85), null);

    // Closed today, with a finished break.
    const c = await session({
      userId: ids.doneToday as string,
      clockInAt: todayAt(0.2),
      clockOutAt: todayAt(0.9),
    });
    await brk(c, todayAt(0.4), todayAt(0.5));

    // Corrected by the admin (yesterday).
    await session({
      userId: ids.doneToday as string,
      clockInAt: daysAgo(1, 8, 55),
      clockOutAt: daysAgo(1, 17, 10),
      correctionReason: 'Forgot to clock out; confirmed with team lead',
      correctedByUserId: admin,
      correctedAt: daysAgo(1, 18, 0),
    });

    // Auto-closed by the nightly job (three days ago).
    await session({
      userId: ids.onLeave as string,
      clockInAt: daysAgo(3, 9, 0),
      clockOutAt: daysAgo(3, 23, 0),
      autoClosed: true,
      correctionReason: 'Auto-closed after 14 hours',
    });

    // Missing clock-out: open since yesterday morning.
    await session({ userId: ids.missing as string, clockInAt: daysAgo(1, 9, 20) });
  });

  const userIds = Object.values(ids);

  return {
    tag,
    ids,
    names,
    userIds,
    sessionIds,
    async cleanup() {
      await m.db.transaction(async (tx) => {
        await tx
          .delete(m.auditEvents)
          .where(
            m.or(
              m.inArray(m.auditEvents.entityId, [...userIds, ...sessionIds]),
              m.inArray(m.auditEvents.actorUserId, userIds),
            ),
          );
        // Breaks go with their sessions (ON DELETE CASCADE).
        await tx
          .delete(m.attendanceSessions)
          .where(m.inArray(m.attendanceSessions.userId, userIds));
        await tx.delete(m.staffProfiles).where(m.inArray(m.staffProfiles.userId, userIds));
        await tx.delete(m.users).where(m.inArray(m.users.id, userIds));
      });
    },
    async remaining() {
      const count = async (q: Promise<unknown[]>) => (await q).length;
      return {
        users: await count(
          m.db.select({ id: m.users.id }).from(m.users).where(m.inArray(m.users.id, userIds)),
        ),
        profiles: await count(
          m.db
            .select({ id: m.staffProfiles.id })
            .from(m.staffProfiles)
            .where(m.inArray(m.staffProfiles.userId, userIds)),
        ),
        sessions: await count(
          m.db
            .select({ id: m.attendanceSessions.id })
            .from(m.attendanceSessions)
            .where(m.inArray(m.attendanceSessions.userId, userIds)),
        ),
        breaks: sessionIds.length
          ? await count(
              m.db
                .select({ id: m.attendanceBreakSessions.id })
                .from(m.attendanceBreakSessions)
                .where(m.inArray(m.attendanceBreakSessions.attendanceSessionId, sessionIds)),
            )
          : 0,
      };
    },
  };
}
