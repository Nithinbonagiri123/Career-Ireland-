import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { checkPasswordPolicy } from '@/lib/auth/password-policy';
import { db } from '@/lib/db/client';
import { passwordResetTokens, users } from '@/lib/db/schema/users';
import { env } from '@/lib/env';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getMailer } from '@/lib/mail';
import { hashPassword } from './service';

/**
 * Password reset flow.
 *
 * The link sent by email contains a 32-byte URL-safe random token. We store
 * only its SHA-256 hex hash. Verification hashes the incoming token and
 * timing-safe-compares — a DB dump therefore cannot be replayed to reset
 * accounts, and probing token existence is timing-invariant.
 *
 * Lifetime: 1 hour, single-use. The completion step invalidates every existing
 * session for the user (via users.sessionsInvalidatedAfter) so a compromised
 * session cannot outlive the reset.
 *
 * Rate limiting: max 5 tokens per email in a rolling hour, enforced BEFORE we
 * hit any timing-sensitive code path so an attacker can't burn through the
 * space of possible emails.
 *
 * Enumeration: the request endpoint always returns the same success message
 * whether or not the email matches a real user. Only the DB row + email delivery
 * differ between the two cases.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

/** URL-safe base64 (no `+`, `/`, `=`) — fits in a URL without encoding. */
function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex. Not for password storage — argon2 is used there. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time compare of two hex strings of equal length. Falls back to
 * `false` when lengths differ (avoids the throw path in timingSafeEqual).
 */
function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function buildResetUrl(token: string): string {
  const base = env.AUTH_URL.replace(/\/+$/, '');
  return `${base}/login/reset?token=${encodeURIComponent(token)}`;
}

/**
 * Kick off a reset for the given email. Always resolves successfully to prevent
 * enumeration — the caller must render an identical "if we know your email…"
 * message regardless of the return value.
 *
 * `rateLimited=true` when the email has already requested 5+ tokens in the
 * rolling window; we swallow the request silently rather than surfacing a
 * different response the attacker could probe.
 */
export async function requestPasswordReset(input: {
  email: string;
  ip: string | null;
}): Promise<{ delivered: boolean }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) return { delivered: false };

  // Rate limit BEFORE the user lookup so timing doesn't leak email existence.
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [recent] = await db
    .select({ n: count() })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.requestedEmail, normalizedEmail),
        gt(passwordResetTokens.requestedAt, cutoff),
      ),
    );
  if ((recent?.n ?? 0) >= RATE_LIMIT_MAX) {
    logger.warn({ email: normalizedEmail, ip: input.ip }, 'password reset rate-limited (email)');
    return { delivered: false };
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user?.isActive) {
    // No such account (or deactivated). Return success shape without doing
    // anything so responses are identical to the happy path.
    return { delivered: false };
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(passwordResetTokens).values({
    tokenHash,
    userId: user.id,
    requestedEmail: normalizedEmail,
    requestedIp: input.ip ?? null,
    expiresAt,
  });

  // Send the email. We deliberately don't await inside a try/catch that swallows
  // — if the mailer fails, the request must fail visibly so the user knows to
  // retry rather than checking a nonexistent inbox.
  await getMailer().send({
    to: user.email,
    subject: 'Reset your Ireland Career Gateway password',
    text: [
      `Hello ${user.fullName || 'there'},`,
      '',
      'A password reset was requested for your Ireland Career Gateway account.',
      'Click the link below to set a new password. This link expires in 1 hour and can be used only once.',
      '',
      buildResetUrl(token),
      '',
      "If you didn't request this, you can safely ignore this email — your password won't change.",
      '',
      '— Ireland Career Gateway',
    ].join('\n'),
  });

  return { delivered: true };
}

/**
 * Verify a reset token is valid and unused. Returns the user email so the
 * reset UI can show it. Returns null on any failure — never leak which check
 * failed.
 */
export async function verifyResetToken(token: string): Promise<{ email: string } | null> {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({
      email: users.email,
      isActive: users.isActive,
      dbTokenHash: passwordResetTokens.tokenHash,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  // Defence in depth — compare hex hashes constant-time even though the
  // WHERE clause already narrowed by tokenHash equality.
  if (!safeHexEqual(row.dbTokenHash, tokenHash)) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;
  if (!row.isActive) return null;

  return { email: row.email };
}

/**
 * Consume a reset token and set the new password. Atomic:
 *  1. Re-verify the token inside the transaction to close the TOCTOU window.
 *  2. Check the new password against the policy (contextual — no email/name).
 *  3. Update password + bump sessionsInvalidatedAfter (kills every existing JWT).
 *  4. Mark the token used (row-level unique on used-once is enforced by the caller).
 *
 * On any race (two tabs completing the same token concurrently) the second call
 * throws because `usedAt` is already set at step 4's read.
 */
export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
  ip: string | null;
}): Promise<void> {
  if (!input.token || typeof input.token !== 'string' || input.token.length < 20) {
    throw new BusinessRuleError('INVALID_RESET_TOKEN', 'This reset link is invalid or expired');
  }
  const tokenHash = hashToken(input.token);
  const now = new Date();

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
        userEmail: users.email,
        userFullName: users.fullName,
        userIsActive: users.isActive,
        userSessionsInvalidatedAfter: users.sessionsInvalidatedAfter,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row || row.usedAt || row.expiresAt < now || !row.userIsActive) {
      throw new BusinessRuleError('INVALID_RESET_TOKEN', 'This reset link is invalid or expired');
    }

    // Policy check with the user's own name/email as context. Same policy that
    // gates change-password and invite-accept — provisioning parity.
    const [firstName, ...rest] = row.userFullName.split(/\s+/);
    const issues = checkPasswordPolicy(input.newPassword, {
      email: row.userEmail,
      firstName: firstName ?? null,
      lastName: rest.join(' ') || null,
    });
    if (issues.length > 0) {
      throw new ValidationError(issues[0] ?? 'Password does not meet the policy', {
        newPassword: issues.join(' · '),
      });
    }

    const passwordHash = await hashPassword(input.newPassword);

    // Bump sessionsInvalidatedAfter so every existing JWT for this user is
    // rejected on next request — a compromised session cannot outlive the reset.
    await tx
      .update(users)
      .set({
        passwordHash,
        sessionsInvalidatedAfter: now,
        updatedAt: sql`NOW()`,
      })
      .where(eq(users.id, row.userId));

    // Mark this token used. Additional guard against reuse — the same row is
    // re-selected above with `usedAt IS NULL`, so a concurrent completion would
    // race here; the WHERE clause below returns 0 rows in that case and we throw.
    const updated = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now, usedIp: input.ip ?? null })
      .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });

    if (updated.length === 0) {
      throw new BusinessRuleError(
        'INVALID_RESET_TOKEN',
        'This reset link was just used from another window',
      );
    }
  });
}
