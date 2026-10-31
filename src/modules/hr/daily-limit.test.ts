import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { attendanceSessions } from '@/lib/db/schema/hr';
import { users } from '@/lib/db/schema/users';

/**
 * The once-per-day clock-in rule, tested where it lives (hr/service.ts).
 *
 * CI's E2E job sets E2E_SKIP_HR_DAILY_LIMIT=1 so browser specs can reset
 * attendance state, which means the browser suite cannot prove the rule
 * there. This test pins the flag explicitly for each case, so the rule is
 * covered in every environment (local and CI's Verify job alike).
 */

const session = {
  user: {
    id: '',
    email: 'hr-daily-limit@example.test',
    name: 'HR Daily Limit',
    role: 'STAFF' as const,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};

vi.mock('@/lib/auth/session', async () => ({
  requireSession: vi.fn(async () => session),
  requireInternalStaff: vi.fn(async () => session),
}));

const svc = await import('./service');

const STAMP = `VITEST_HRDAILY_${Date.now()}`;
const originalFlag = process.env.E2E_SKIP_HR_DAILY_LIMIT;

function setFlag(value: string | undefined) {
  if (value === undefined) delete process.env.E2E_SKIP_HR_DAILY_LIMIT;
  else process.env.E2E_SKIP_HR_DAILY_LIMIT = value;
}

async function clearSessions() {
  await db.delete(attendanceSessions).where(eq(attendanceSessions.userId, session.user.id));
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
  if (!u) throw new Error('user seed failed');
  session.user.id = u.id;
});

afterEach(async () => {
  setFlag(originalFlag);
  await clearSessions();
});

afterAll(async () => {
  if (!session.user.id) return;
  await clearSessions();
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, session.user.id));
  await db.delete(users).where(eq(users.id, session.user.id));
});

describe('once-per-day clock-in rule', () => {
  it('refuses a second clock-in on the same day after clocking out (rule on)', async () => {
    setFlag(undefined);
    await svc.clockIn(null);
    await svc.clockOut(null);
    await expect(svc.clockIn(null)).rejects.toMatchObject({
      code: 'ALREADY_CLOCKED_IN_TODAY',
      message: expect.stringMatching(/already clocked in today/i),
    });
    const rows = await db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(eq(attendanceSessions.userId, session.user.id));
    expect(rows).toHaveLength(1);
  });

  it('only the explicit E2E flag value "1" turns the rule off', async () => {
    setFlag('true');
    await svc.clockIn(null);
    await svc.clockOut(null);
    await expect(svc.clockIn(null)).rejects.toMatchObject({ code: 'ALREADY_CLOCKED_IN_TODAY' });
  });

  it('with E2E_SKIP_HR_DAILY_LIMIT=1 (CI browser suite) a second session is allowed', async () => {
    setFlag('1');
    await svc.clockIn(null);
    await svc.clockOut(null);
    const second = await svc.clockIn(null);
    expect(second.clockOutAt).toBeNull();
  });
});
