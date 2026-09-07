import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { attendanceSessions } from '@/lib/db/schema/hr';
import { users } from '@/lib/db/schema/users';
import { hashPassword } from '@/modules/auth/service';

/**
 * DB-level constraint tests. Seed a dedicated user so assertions can't
 * collide with other suites, then insert directly via Drizzle to verify
 * constraints do their job even without going through the service.
 */

const PREFIX = `VITEST_HR_${Date.now()}`;
const EMAIL = `${PREFIX.toLowerCase()}@example.test`;
let userId: string;

beforeEach(async () => {
  const passwordHash = await hashPassword('Str0ng!Passw0rd-99');
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (existing) {
    userId = existing.id;
  } else {
    const [row] = await db
      .insert(users)
      .values({
        email: EMAIL,
        passwordHash,
        fullName: `${PREFIX} User`,
        role: 'STAFF',
      })
      .returning({ id: users.id });
    if (!row) throw new Error('failed to seed hr test user');
    userId = row.id;
  }
  await db.delete(attendanceSessions).where(eq(attendanceSessions.userId, userId));
});

afterAll(async () => {
  if (userId) {
    await db.delete(attendanceSessions).where(eq(attendanceSessions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
});

describe('attendance_sessions constraints', () => {
  it('allows a single open session for a user', async () => {
    const [row] = await db.insert(attendanceSessions).values({ userId }).returning();
    if (!row) throw new Error('insert returned no row');
    expect(row.clockOutAt).toBeNull();
  });

  it('refuses a second open session while one is already open', async () => {
    await db.insert(attendanceSessions).values({ userId });
    // Drizzle wraps Postgres errors in a "Failed query" envelope; the
    // Postgres error code sits on .cause. Asserting the promise rejects
    // is enough — the constraint's existence is verified by the schema
    // + migration; this test only proves it's actually enforced at
    // runtime, not the exact wording of the error.
    await expect(db.insert(attendanceSessions).values({ userId })).rejects.toThrow();
  });

  it('permits a new open session after the previous is closed', async () => {
    const [first] = await db.insert(attendanceSessions).values({ userId }).returning();
    if (!first) throw new Error('first insert returned no row');
    // Close the first session — NOW() will be a handful of ms after
    // clockInAt so the CHECK is satisfied.
    await new Promise((r) => setTimeout(r, 50));
    await db
      .update(attendanceSessions)
      .set({ clockOutAt: new Date() })
      .where(eq(attendanceSessions.id, first.id));
    const [second] = await db.insert(attendanceSessions).values({ userId }).returning();
    if (!second) throw new Error('second insert returned no row');
    expect(second.id).not.toBe(first.id);
  });

  it('refuses a clock-out earlier than or equal to clock-in', async () => {
    const [row] = await db.insert(attendanceSessions).values({ userId }).returning();
    if (!row) throw new Error('insert returned no row');
    await expect(
      db
        .update(attendanceSessions)
        .set({ clockOutAt: row.clockInAt })
        .where(eq(attendanceSessions.id, row.id)),
    ).rejects.toThrow();
  });
});
