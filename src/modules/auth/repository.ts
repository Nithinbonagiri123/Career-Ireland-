import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { type NewUser, type User, users } from '@/lib/db/schema/users';

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function insertUser(data: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(data).returning();
  if (!row) throw new Error('Failed to insert user');
  return row;
}

export async function touchLastLogin(id: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
}

/**
 * Update password + revoke other sessions atomically. The caller must have
 * already verified the current password.
 */
export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  const now = new Date();
  await db
    .update(users)
    .set({ passwordHash, sessionsInvalidatedAfter: now, updatedAt: now })
    .where(eq(users.id, id));
}
