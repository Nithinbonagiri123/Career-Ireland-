import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { loginAttempts } from '@/lib/db/schema/users';
import { isLoginBlocked, recordLoginAttempt } from './login-throttle';

const PREFIX = `VITEST_THROTTLE_${Date.now()}`;
const EMAIL = `${PREFIX.toLowerCase()}@example.test`;
const IP = '203.0.113.99';

beforeEach(async () => {
  await db.delete(loginAttempts).where(eq(loginAttempts.email, EMAIL));
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, IP));
});

afterAll(async () => {
  await db.delete(loginAttempts).where(eq(loginAttempts.email, EMAIL));
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, IP));
});

describe('isLoginBlocked', () => {
  it('returns false when the email has no attempts', async () => {
    expect(await isLoginBlocked(EMAIL, IP)).toBe(false);
  });

  it('does not count successes toward the email budget', async () => {
    for (let i = 0; i < 10; i++) await recordLoginAttempt(EMAIL, IP, 'SUCCESS');
    expect(await isLoginBlocked(EMAIL, IP)).toBe(false);
  });

  it('blocks at 5 failures for the same email in the window', async () => {
    for (let i = 0; i < 5; i++) await recordLoginAttempt(EMAIL, null, 'FAILURE');
    expect(await isLoginBlocked(EMAIL, null)).toBe(true);
  });

  it('permits the 4th failure but blocks the 5th', async () => {
    for (let i = 0; i < 4; i++) await recordLoginAttempt(EMAIL, null, 'FAILURE');
    expect(await isLoginBlocked(EMAIL, null)).toBe(false);
    await recordLoginAttempt(EMAIL, null, 'FAILURE');
    expect(await isLoginBlocked(EMAIL, null)).toBe(true);
  });

  it('blocks a fresh email once the IP failure budget is exhausted', async () => {
    // 20 failures from the same IP across different email addresses.
    for (let i = 0; i < 20; i++) {
      await recordLoginAttempt(`${PREFIX.toLowerCase()}-${i}@example.test`, IP, 'FAILURE');
    }
    // A first-time email from that IP should still be refused.
    expect(await isLoginBlocked(EMAIL, IP)).toBe(true);
    // And with a null IP it comes back fine — email is clean.
    expect(await isLoginBlocked(EMAIL, null)).toBe(false);
  });

  it('null IP falls back to email-only counter', async () => {
    for (let i = 0; i < 4; i++) await recordLoginAttempt(EMAIL, null, 'FAILURE');
    expect(await isLoginBlocked(EMAIL, null)).toBe(false);
  });
});
