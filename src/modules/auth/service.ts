import argon2 from 'argon2';
import type { UserRole } from '@/lib/db/schema/users';
import { logger } from '@/lib/logger';
import { findUserByEmail, touchLastLogin } from './repository';

export type AuthorizedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
  };
}
