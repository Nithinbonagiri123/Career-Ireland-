import argon2 from 'argon2';
import { checkPasswordPolicy, type PasswordContext } from '@/lib/auth/password-policy';
import type { UserRole } from '@/lib/db/schema/users';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { findUserByEmail, findUserById, touchLastLogin, updatePasswordHash } from './repository';

export type AuthorizedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  personId: string | null;
  employerId: string | null;
};

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { ...ARGON2_OPTIONS, raw: false });
}

export function verifyPasswordHash(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Verify credentials against the users table.
 * Returns null on any failure — never leak which part failed
 * (unknown email vs. wrong password vs. deactivated account).
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthorizedUser | null> {
  const user = await findUserByEmail(email.trim());
  if (!user?.isActive) {
    // Waste time to blunt timing attacks probing valid emails.
    await argon2.hash(password, ARGON2_OPTIONS).catch(() => null);
    return null;
  }

  let valid = false;
  try {
    valid = await verifyPasswordHash(user.passwordHash, password);
  } catch (e) {
    logger.warn({ err: e, userId: user.id }, 'argon2 verify threw');
    return null;
  }
  if (!valid) return null;

  touchLastLogin(user.id).catch((e) =>
    logger.warn({ err: e, userId: user.id }, 'failed to update last_login_at'),
  );

  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    personId: user.personId,
    employerId: user.employerId,
  };
}

/**
 * Change a user's password. Verifies the current password, hashes the new one,
 * and revokes every existing session (including this one — the caller should
 * redirect to /login afterwards).
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await findUserById(userId);
  if (!user?.isActive) throw new AuthenticationError();

  let currentValid = false;
  try {
    currentValid = await verifyPasswordHash(user.passwordHash, currentPassword);
  } catch (e) {
    logger.warn({ err: e, userId }, 'argon2 verify threw during change-password');
    throw new AuthenticationError('Current password is incorrect');
  }
  if (!currentValid) {
    throw new ValidationError('Current password is incorrect', {
      currentPassword: 'Current password is incorrect',
    });
  }

  // Enforce contextual password policy — must not contain user's own name/email.
  const [firstName, ...rest] = user.fullName.split(/\s+/);
  const lastName = rest.join(' ');
  const ctx: PasswordContext = {
    email: user.email,
    firstName: firstName ?? null,
    lastName: lastName || null,
  };
  const issues = checkPasswordPolicy(newPassword, ctx);
  if (issues.length > 0) {
    throw new ValidationError(issues[0] ?? 'Password does not meet the policy', {
      newPassword: issues.join(' · '),
    });
  }

  const passwordHash = await hashPassword(newPassword);
  await updatePasswordHash(userId, passwordHash);
}
