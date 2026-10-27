import type { UserRole } from '@/lib/db/schema/users';

const INTERNAL: ReadonlySet<UserRole> = new Set<UserRole>([
  'ADMIN',
  'STAFF',
  'MANAGER',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'FINANCE',
]);

/**
 * Decision B1 — owner authority includes every ADMIN-only check. An
 * internal user flagged as owner satisfies any role list that contains
 * ADMIN (e.g. ['ADMIN'] or ['ADMIN', 'FINANCE']). Lists without ADMIN
 * stay role-exact, and portal roles never gain authority from the flag.
 * Pure so it can be tested without the auth runtime.
 */
export function roleSatisfies(
  user: { role: UserRole; isOwner: boolean },
  roles: readonly UserRole[],
): boolean {
  if (roles.includes(user.role)) return true;
  return user.isOwner && roles.includes('ADMIN') && INTERNAL.has(user.role);
}
