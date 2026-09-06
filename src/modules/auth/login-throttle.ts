import { and, count, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { loginAttempts } from '@/lib/db/schema/users';

/** Sliding window for both email and IP counters. */
const WINDOW_MS = 15 * 60 * 1000;

/**
 * After this many failures in the window for the same email, further attempts
 * are refused until the oldest failure ages out. Tuned for a small internal
 * team — legitimate users typo a couple of times, brute-force needs orders
 * of magnitude more.
 */
const MAX_FAILURES_PER_EMAIL = 5;

/**
 * IP cap is deliberately higher than the email cap: office NAT + shared
 * Wi-Fi mean many real users can share one IP, but a distributed brute-force
 * still trips this before the per-email guard is bypassed by email cycling.
 */
const MAX_FAILURES_PER_IP = 20;

/**
 * True when the credential submission should be refused without checking the
 * password. Only counts FAILURE rows: a successful login within the window
 * does not consume the budget. On DB error we fail-open (return false) — the
 * argon2 verify still runs, so an outage doesn't lock legitimate users out.
 */
export async function isLoginBlocked(email: string, ip: string | null): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - WINDOW_MS);
    const emailQuery = db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.outcome, 'FAILURE'),
          gt(loginAttempts.attemptedAt, cutoff),
        ),
      );
    const ipQuery = ip
      ? db
          .select({ n: count() })
          .from(loginAttempts)
          .where(
            and(
              eq(loginAttempts.ip, ip),
              eq(loginAttempts.outcome, 'FAILURE'),
              gt(loginAttempts.attemptedAt, cutoff),
            ),
          )
      : Promise.resolve([{ n: 0 }]);
    const [emailRows, ipRows] = await Promise.all([emailQuery, ipQuery]);
    const emailFailures = emailRows[0]?.n ?? 0;
    const ipFailures = ipRows[0]?.n ?? 0;
    return emailFailures >= MAX_FAILURES_PER_EMAIL || ipFailures >= MAX_FAILURES_PER_IP;
  } catch {
    return false;
  }
}

/**
 * Record one credential submission. Fire-and-forget in the caller — the
 * function swallows errors internally so a logging outage cannot break
 * authentication.
 */
export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  outcome: 'SUCCESS' | 'FAILURE',
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({ email, ip, outcome });
  } catch {
    /* swallow */
  }
}
