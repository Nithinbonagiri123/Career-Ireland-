import { desc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { type User, users } from '@/lib/db/schema/users';

export type UserListRow = Pick<
  User,
  'id' | 'email' | 'fullName' | 'role' | 'isActive' | 'lastLoginAt' | 'createdAt'
>;

export async function listUsers(): Promise<UserListRow[]> {
  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function updateUserRole(tx: DbExecutor, id: string, role: 'ADMIN' | 'STAFF') {
  const [row] = await tx
    .update(users)
    .set({ role, updatedAt: new Date(), sessionsInvalidatedAfter: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function updateUserActive(tx: DbExecutor, id: string, isActive: boolean) {
  const [row] = await tx
    .update(users)
    .set({
      isActive,
      updatedAt: new Date(),
      sessionsInvalidatedAfter: sql`CASE WHEN ${users.isActive} <> ${isActive} THEN NOW() ELSE ${users.sessionsInvalidatedAfter} END`,
    })
    .where(eq(users.id, id))
    .returning();
  return row;
}
