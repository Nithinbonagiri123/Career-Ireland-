import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { attendanceSessions } from '@/lib/db/schema/hr';
import { type UserRole, users } from '@/lib/db/schema/users';
import { AuthorizationError } from '@/lib/errors';

/**
 * S-HR1 — HR privacy at the server boundary.
 *  - Team-wide attendance readers require the existing HR Board grant
 *    (main.hr_board.view) or the owner; FINANCE and STAFF presets are
 *    refused before any query runs.
 *  - No read helper returns clock-in / clock-out IP addresses, for team
 *    data or for the user's own sessions. The IPs stay in the table.
 * Permissions are evaluated from the real role presets.
 */

const session = {
  user: {
    id: '',
    email: 'hr-privacy@example.test',
    name: 'HR Privacy',
    role: 'ADMIN' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};

vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError: AuthErr } = await import('@/lib/errors');
  const { presetForRole, hasPermission, encodeKey } = await import('@/lib/auth/permissions');
  const INTERNAL = ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'FINANCE'];
  const granted = () =>
    new Set(
      presetForRole(session.user.role as Parameters<typeof presetForRole>[0]).map((k) =>
        encodeKey(k.business, k.module, k.verb),
      ),
    );
  return {
    requireSession: vi.fn(async () => session),
    requireInternalStaff: vi.fn(async () => {
      if (!INTERNAL.includes(session.user.role)) throw new AuthErr();
      return session;
    }),
    requireRole: vi.fn(async (roles: string[]) => {
      if (!roles.includes(session.user.role)) throw new AuthErr();
      return session;
    }),
    requirePermission: vi.fn(async (b: string, m: string, v: string) => {
      if (!session.user.isOwner && !hasPermission(granted(), b as 'main', m, v as 'view')) {
        throw new AuthErr();
      }
      return session;
    }),
  };
});

const svc = await import('./service');

const STAMP = `VITEST_HRPRIV_${Date.now()}`;
const IP_IN = '203.0.113.7';
const IP_OUT = '203.0.113.8';
let userId = '';

function as(role: UserRole, isOwner = false) {
  session.user.role = role;
  session.user.isOwner = isOwner;
}

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `${STAMP.toLowerCase()}@example.test`,
      passwordHash: 'x',
      fullName: `${STAMP} Worker`,
      role: 'STAFF',
    })
    .returning({ id: users.id });
  if (!u) throw new Error('seed user failed');
  userId = u.id;
  session.user.id = userId;
  const now = Date.now();
  // One closed session with both IPs, one open session (so "working now").
  await db.insert(attendanceSessions).values({
    userId,
    clockInAt: new Date(now - 3 * 60 * 60 * 1000),
    clockOutAt: new Date(now - 2 * 60 * 60 * 1000),
    clockInIp: IP_IN,
    clockOutIp: IP_OUT,
  });
  await db.insert(attendanceSessions).values({
    userId,
    clockInAt: new Date(now - 30 * 60 * 1000),
    clockInIp: IP_IN,
  });
});

afterAll(async () => {
  if (!userId) return;
  await db.delete(attendanceSessions).where(eq(attendanceSessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

const TEAM_READERS = {
  fetchStaffCurrentlyWorking: () => svc.fetchStaffCurrentlyWorking(),
  fetchRecentAttendance: () => svc.fetchRecentAttendance({ limit: 500 }),
  fetchTodayAttendance: () => svc.fetchTodayAttendance(),
  fetchStaffDirectory: () => svc.fetchStaffDirectory(),
  fetchHrDashboard: () => svc.fetchHrDashboard(),
};

describe('team attendance needs the HR Board grant', () => {
  for (const role of ['FINANCE', 'STAFF', 'RECRUITER', 'DOCUMENT_SPECIALIST'] as const) {
    for (const [name, call] of Object.entries(TEAM_READERS)) {
      it(`${role} without hr_board is refused by ${name}`, async () => {
        as(role);
        await expect(call()).rejects.toBeInstanceOf(AuthorizationError);
      });
    }
  }

  for (const [role, owner] of [
    ['ADMIN', false],
    ['MANAGER', false],
    ['FINANCE', true],
  ] as const) {
    it(`${role}${owner ? ' (owner)' : ''} keeps access to who's working now`, async () => {
      as(role, owner);
      const rows = await svc.fetchStaffCurrentlyWorking();
      expect(rows.some((r) => r.userId === userId)).toBe(true);
    });
  }
});

describe('no read helper returns clock-in / clock-out IPs', () => {
  it('HR Board rows carry no IP fields or values', async () => {
    as('ADMIN');
    const rows = await svc.fetchRecentAttendance({ limit: 500 });
    const mine = rows.filter((r) => r.session.userId === userId);
    expect(mine.length).toBe(2);
    for (const r of mine) {
      expect(r.session).not.toHaveProperty('clockInIp');
      expect(r.session).not.toHaveProperty('clockOutIp');
    }
    const payload = JSON.stringify(rows);
    expect(payload).not.toContain(IP_IN);
    expect(payload).not.toContain(IP_OUT);
  });

  it("today's team rows and who's-working rows carry no IPs", async () => {
    as('ADMIN');
    const payload = JSON.stringify([
      await svc.fetchTodayAttendance(),
      await svc.fetchStaffCurrentlyWorking(),
    ]);
    expect(payload).not.toContain(IP_IN);
    expect(payload).not.toMatch(/clockInIp|clockOutIp/);
  });

  it("a user's own sessions and today status carry no IPs", async () => {
    as('STAFF');
    const payload = JSON.stringify([
      await svc.fetchMyRecentSessions(userId, 10),
      await svc.fetchMyTodayStatus(userId),
    ]);
    expect(payload).not.toContain(IP_IN);
    expect(payload).not.toMatch(/clockInIp|clockOutIp/);
  });

  it('the IPs are still stored (records untouched)', async () => {
    const stored = await db
      .select({ ip: attendanceSessions.clockInIp })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.userId, userId));
    expect(stored.every((r) => r.ip === IP_IN)).toBe(true);
  });

  it('toSessionView strips both IP fields from action results', () => {
    const view = svc.toSessionView({
      id: 'x',
      userId: 'u',
      clockInAt: new Date(),
      clockOutAt: null,
      clockInIp: IP_IN,
      clockOutIp: IP_OUT,
    } as Parameters<typeof svc.toSessionView>[0]);
    expect(view).not.toHaveProperty('clockInIp');
    expect(view).not.toHaveProperty('clockOutIp');
    expect(view.userId).toBe('u');
  });
});
