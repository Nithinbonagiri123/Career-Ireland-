import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { BUSINESSES, type Business, reachableBusinesses } from '@/lib/auth/permissions';
import { getSession, loadCurrentUserPermissions } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/users';

/**
 * Which workspace is the user currently viewing? Resolved server-side
 * for every render so the sidebar can filter to the right sections.
 *
 * Order of precedence:
 *   1. `icg_workspace` cookie (set by the business switcher click)
 *   2. `users.current_workspace` column (last-used, persisted)
 *   3. Owner → 'main'
 *   4. First reachable business (based on permissions)
 *   5. 'main' as a last-resort fallback
 *
 * If the resolved workspace is not one the user has access to, we fall
 * through to the next tier — a cookie left over from a previous grant
 * shouldn't survive a permission revoke.
 */
export const WORKSPACE_COOKIE = 'icg_workspace';

export function isBusiness(value: unknown): value is Business {
  return typeof value === 'string' && (BUSINESSES as readonly string[]).includes(value);
}

/**
 * Return the workspace the user should be looking at right now, plus
 * the list of workspaces they can switch to.
 *
 * Returns `null` if the user is unauthenticated. Callers should
 * short-circuit before rendering the sidebar in that case.
 */
export async function resolveCurrentWorkspace(): Promise<{
  current: Business;
  reachable: Business[];
  isOwner: boolean;
} | null> {
  const session = await getSession();
  if (!session) return null;

  const snap = await loadCurrentUserPermissions();
  if (!snap) return null;

  const reachable: Business[] = snap.isOwner ? [...BUSINESSES] : reachableBusinesses(snap.granted);

  // Owner with no explicit grants still sees every workspace via bypass.
  // Non-owner with zero permissions gets an empty reachable list — the
  // caller renders a "no access" state instead of a sidebar.
  if (reachable.length === 0) {
    return { current: 'main', reachable: [], isOwner: false };
  }

  // 1. Cookie
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WORKSPACE_COOKIE)?.value;
  if (isBusiness(cookieValue) && reachable.includes(cookieValue)) {
    return { current: cookieValue, reachable, isOwner: snap.isOwner };
  }

  // 2. DB column
  const [row] = await db
    .select({ currentWorkspace: users.currentWorkspace })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (isBusiness(row?.currentWorkspace) && reachable.includes(row.currentWorkspace)) {
    return { current: row.currentWorkspace, reachable, isOwner: snap.isOwner };
  }

  // 3. Owner default
  if (snap.isOwner) {
    return { current: 'main', reachable, isOwner: true };
  }

  // 4. First reachable
  return { current: reachable[0]!, reachable, isOwner: false };
}
