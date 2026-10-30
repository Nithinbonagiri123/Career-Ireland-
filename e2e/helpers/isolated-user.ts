import { randomBytes } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';

/**
 * R6 — a throwaway internal user for tests whose state is per-user and
 * per-day (e.g. HR attendance: one clock-in per calendar day). Each call
 * creates a fresh user with a random password, signs it in in its own
 * browser context, and afterwards removes ONLY rows that belong to that
 * user. Business rules are untouched.
 */
export async function withIsolatedUser(
  browser: Browser,
  fn: (page: Page, user: { id: string; email: string }) => Promise<void>,
  opts: { role?: 'STAFF' | 'RECRUITER' | 'MANAGER' } = {},
): Promise<void> {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../../src/lib/db/client');
  const { users } = await import('../../src/lib/db/schema/users');
  const argon2 = (await import('argon2')).default;

  const stamp = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const email = `e2e-iso-${stamp}@ireland-careers.test`;
  const password = randomBytes(18).toString('base64url');
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
  const [user] = await db
    .insert(users)
    .values({ email, fullName: `E2E Isolated ${stamp}`, passwordHash, role: opts.role ?? 'STAFF' })
    .returning({ id: users.id });
  if (!user) throw new Error('isolated user seed failed');

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
    await fn(page, { id: user.id, email });
  } finally {
    await context.close();
    // Remove only this user's rows: attendance first (breaks hang off
    // sessions), then anything else that references the user, then the user.
    await db.execute(
      sql`DELETE FROM attendance_break_sessions WHERE attendance_session_id IN (SELECT id FROM attendance_sessions WHERE user_id = ${user.id})`,
    );
    await db.execute(
      sql`DELETE FROM audit_events WHERE actor_user_id = ${user.id} OR entity_id = ${user.id}::text OR entity_id IN (SELECT id::text FROM attendance_sessions WHERE user_id = ${user.id})`,
    );
    await db.execute(sql`DELETE FROM attendance_sessions WHERE user_id = ${user.id}`);
    const refs = await db.execute<{ tbl: string; col: string }>(sql`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.confrelid = 'users'::regclass AND c.contype = 'f'`);
    for (let pass = 0; pass < 3; pass++) {
      for (const r of refs) {
        await db
          .execute(
            sql`DELETE FROM ${sql.identifier(r.tbl)} WHERE ${sql.identifier(r.col)} = ${user.id}`,
          )
          .catch(() => {});
      }
      const done = await db
        .delete(users)
        .where(eq(users.id, user.id))
        .then(() => true)
        .catch(() => false);
      if (done) break;
    }
  }
}
