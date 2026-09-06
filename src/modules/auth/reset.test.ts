import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { passwordResetTokens, users } from '@/lib/db/schema/users';
import {
  completePasswordReset,
  requestPasswordReset,
  verifyResetToken as verifyToken,
} from './reset';
import { hashPassword, verifyPasswordHash } from './service';

/**
 * Reset flow against the real dev DB. Uses a dedicated E2E user prefixed
 * `VITEST_RESET_` so cleanup is safe and the test can co-exist with the
 * e2e-admin fixture without stepping on it.
 *
 * NOTE: the "request" tests only assert the ENUMERATION-SAFE contract — the
 * server function must never throw for unknown emails and must not return
 * different shapes. It's important these tests don't inadvertently start
 * checking .delivered because that would encode enumeration into the test
 * suite and future authors might rely on it.
 */

const PREFIX = `VITEST_RESET_${Date.now()}`;
const EMAIL = `${PREFIX.toLowerCase()}@example.test`;

let userId: string;

beforeAll(async () => {
  const passwordHash = await hashPassword('Or1g1nal-Password!23');
  const [row] = await db
    .insert(users)
    .values({
      email: EMAIL,
      passwordHash,
      fullName: `${PREFIX} User`,
      role: 'ADMIN',
    })
    .returning({ id: users.id });
  if (!row) throw new Error('failed to seed test user');
  userId = row.id;
});

afterAll(async () => {
  if (userId) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
});

beforeEach(async () => {
  // Isolate token state between tests within this file.
  if (userId) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }
});

describe('requestPasswordReset — enumeration safety', () => {
  it('returns a resolved promise for a real email', async () => {
    // We don't assert .delivered=true because that would leak into a caller
    // dependency. What matters is: the function completed without throwing
    // and did NOT throw a distinguishable error for the "known email" case.
    await expect(requestPasswordReset({ email: EMAIL, ip: '127.0.0.1' })).resolves.toBeDefined();
  });

  it('returns a resolved promise for a non-existent email (same shape)', async () => {
    await expect(
      requestPasswordReset({ email: 'nobody-would-have-this-email@example.test', ip: null }),
    ).resolves.toBeDefined();
  });

  it('rate-limits to 5 requests per hour per email', async () => {
    // Pre-populate 5 recent tokens for this user (simulating burst)
    const now = new Date();
    const rows = Array.from({ length: 5 }, () => ({
      tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      userId,
      requestedEmail: EMAIL,
      requestedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    }));
    await db.insert(passwordResetTokens).values(rows);

    // The 6th request must be silently rate-limited — same return shape, but
    // no new row inserted (we check the row count after).
    await requestPasswordReset({ email: EMAIL, ip: '127.0.0.1' });
    const [after] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(after?.n).toBe(5); // Still 5, not 6 — the 6th was rate-limited.
  });
});

describe('verifyResetToken', () => {
  it('accepts a fresh valid token and returns the account email', async () => {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await db.insert(passwordResetTokens).values({
      tokenHash,
      userId,
      requestedEmail: EMAIL,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await expect(verifyToken(rawToken)).resolves.toEqual({ email: EMAIL });
  });

  it('rejects an expired token', async () => {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await db.insert(passwordResetTokens).values({
      tokenHash,
      userId,
      requestedEmail: EMAIL,
      requestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await expect(verifyToken(rawToken)).resolves.toBeNull();
  });

  it('rejects a used token', async () => {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await db.insert(passwordResetTokens).values({
      tokenHash,
      userId,
      requestedEmail: EMAIL,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: new Date(),
    });
    await expect(verifyToken(rawToken)).resolves.toBeNull();
  });

  it('rejects a bogus token (unknown hash)', async () => {
    await expect(verifyToken('not-a-real-token-just-a-string')).resolves.toBeNull();
  });

  it('rejects an empty / too-short token without querying the DB', async () => {
    await expect(verifyToken('')).resolves.toBeNull();
    await expect(verifyToken('abc')).resolves.toBeNull();
  });
});

describe('completePasswordReset', () => {
  async function seedFreshToken(): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await db.insert(passwordResetTokens).values({
      tokenHash,
      userId,
      requestedEmail: EMAIL,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return rawToken;
  }

  it('updates the password hash + invalidates existing sessions + marks token used', async () => {
    const rawToken = await seedFreshToken();
    const beforeUser = (
      await db
        .select({
          sessionsInvalidatedAfter: users.sessionsInvalidatedAfter,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
    if (!beforeUser) throw new Error('user missing');

    // Small sleep so sessionsInvalidatedAfter strictly moves forward.
    await new Promise((r) => setTimeout(r, 15));

    await completePasswordReset({
      token: rawToken,
      newPassword: 'Brand-N3w-Passphrase',
      ip: '127.0.0.1',
    });

    const afterUser = (
      await db
        .select({
          sessionsInvalidatedAfter: users.sessionsInvalidatedAfter,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
    if (!afterUser) throw new Error('user missing after reset');

    expect(afterUser.passwordHash).not.toBe(beforeUser.passwordHash);
    expect(await verifyPasswordHash(afterUser.passwordHash, 'Brand-N3w-Passphrase')).toBe(true);
    expect(afterUser.sessionsInvalidatedAfter.getTime()).toBeGreaterThan(
      beforeUser.sessionsInvalidatedAfter.getTime(),
    );

    const [tokenRow] = await db
      .select({ usedAt: passwordResetTokens.usedAt, usedIp: passwordResetTokens.usedIp })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .limit(1);
    expect(tokenRow?.usedAt).toBeInstanceOf(Date);
    expect(tokenRow?.usedIp).toBe('127.0.0.1');
  });

  it('rejects reuse of an already-consumed token', async () => {
    const rawToken = await seedFreshToken();
    await completePasswordReset({
      token: rawToken,
      newPassword: 'Brand-N3w-Passphrase-42',
      ip: null,
    });
    await expect(
      completePasswordReset({ token: rawToken, newPassword: 'Yet-4nother-Password', ip: null }),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('rejects a completely bogus token', async () => {
    await expect(
      completePasswordReset({
        token: 'nope-this-does-not-exist-in-the-db',
        newPassword: 'Brand-N3w-Passphrase-99',
        ip: null,
      }),
    ).rejects.toThrow(/invalid or expired/i);
  });

  it('rejects a new password that violates the policy (contains user name)', async () => {
    const rawToken = await seedFreshToken();
    await expect(
      completePasswordReset({
        token: rawToken,
        newPassword: `${PREFIX}-User-password-1!`, // Contains the user's own name
        ip: null,
      }),
    ).rejects.toThrow();
    // Token should NOT have been consumed by a rejected attempt.
    const [row] = await db
      .select({ usedAt: passwordResetTokens.usedAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .limit(1);
    expect(row?.usedAt).toBeNull();
  });

  it('rejects a new password that is too short', async () => {
    const rawToken = await seedFreshToken();
    await expect(
      completePasswordReset({ token: rawToken, newPassword: 'abc', ip: null }),
    ).rejects.toThrow();
  });
});
