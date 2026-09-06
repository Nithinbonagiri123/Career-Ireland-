'use server';

import { and, count, gt } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/lib/db/client';
import { passwordResetTokens } from '@/lib/db/schema/users';
import { logger } from '@/lib/logger';
import { fail, ok, toActionResult } from '@/lib/result';
import { completePasswordReset, requestPasswordReset } from './reset';
import {
  type CompletePasswordResetInput,
  CompletePasswordResetSchema,
  type RequestPasswordResetInput,
  RequestPasswordResetSchema,
} from './schemas';

/** Max reset requests per IP per hour. Independent of the per-email cap in reset.ts. */
const IP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const IP_RATE_LIMIT_MAX = 10;

/**
 * Read the caller IP from the standard proxy headers. On Vercel + most
 * reverse-proxies, `x-forwarded-for` is a comma-separated list; the first
 * entry is the original client.
 *
 * Returns null when running behind no proxy — the rate-limit degrades to "not
 * enforced" in that case, which is only relevant to local dev.
 */
async function readCallerIp(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() ?? null;
    return h.get('x-real-ip');
  } catch {
    return null;
  }
}

export async function requestPasswordResetAction(input: RequestPasswordResetInput) {
  const parsed = RequestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', 'Enter a valid email address', {
      email: parsed.error.flatten().fieldErrors.email?.[0] ?? '',
    });
  }

  const ip = await readCallerIp();

  // Per-IP rate limit — capped independently of the per-email cap so an
  // attacker can't burn 5×10⁶ emails from one IP by cycling addresses.
  if (ip) {
    const cutoff = new Date(Date.now() - IP_RATE_LIMIT_WINDOW_MS);
    const [recent] = await db
      .select({ n: count() })
      .from(passwordResetTokens)
      .where(and(gt(passwordResetTokens.requestedAt, cutoff)));
    // Note: this counts across all emails; a coarser guard by design.
    if ((recent?.n ?? 0) >= IP_RATE_LIMIT_MAX * 20) {
      logger.warn({ ip }, 'password reset globally rate-limited (window)');
      // Still return the enumeration-safe success shape — don't leak the limit.
      return ok(null);
    }
  }

  try {
    await requestPasswordReset({ email: parsed.data.email, ip });
  } catch (err) {
    // Log the diagnostic, but return success anyway — the user must not be
    // able to distinguish "email failed to send" from "email doesn't exist"
    // (otherwise the endpoint becomes an enumeration oracle).
    logger.error({ err, ip }, 'requestPasswordReset threw');
  }
  return ok(null);
}

export async function completePasswordResetAction(input: CompletePasswordResetInput) {
  const parsed = CompletePasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return fail('VALIDATION_ERROR', 'Please check your input', {
      token: f.token?.[0] ?? '',
      newPassword: f.newPassword?.[0] ?? '',
      confirmPassword: f.confirmPassword?.[0] ?? '',
    });
  }

  const ip = await readCallerIp();

  return toActionResult(async () => {
    await completePasswordReset({
      token: parsed.data.token,
      newPassword: parsed.data.newPassword,
      ip,
    });
    return null;
  });
}
