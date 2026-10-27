import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { recordAudit } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { userPermissions } from '@/lib/db/schema/permissions';
import { type UserRole, users } from '@/lib/db/schema/users';
import { AuthorizationError } from '../errors';
import { auth } from './config';
import { type Business, encodeKey, hasPermission, type Verb } from './permissions';
import { roleSatisfies } from './role-rules';

export { roleSatisfies } from './role-rules';

/**
 * Write an AUTH_DENIED audit event. Called by the gate helpers before
 * they throw, so the owner can see who tried to reach what and was
 * refused. Best-effort: audit failure never blocks the throw.
 */
async function logAuthDenied(
  userId: string,
  reason: 'permission' | 'role' | 'any_permission',
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    let pathname: string | null = null;
    try {
      const h = await headers();
      pathname = h.get('x-icg-pathname');
    } catch {
      // No request context (background job) — fine.
    }
    await recordAudit(db, {
      actorUserId: userId,
      entityType: 'session',
      entityId: userId,
      action: 'AUTH_DENIED',
      context: { reason, path: pathname, ...detail },
    });
  } catch {
    // Swallow — this is instrumentation, not a hard requirement.
  }
}

export type Session = {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    personId: string | null;
    employerId: string | null;
    /**
     * Business owner flag (multi-owner model — Session 33). Owners
     * bypass every permission check AND are the only users who can
     * reassign ownership of a record. Rendered as a short-circuit
     * on the token so UI gates don't need a per-render DB round-trip.
     */
    isOwner: boolean;
  };
};

/**
 * Per-request memoized session. `auth()`'s jwt callback revalidates the
 * user against the DB (deactivation / role change / invalidation) on
 * every call; a single page render calls getSession via its gate
 * helpers 15–20 times, which used to mean 15–20 identical users-table
 * round-trips per request. React cache() collapses that to ONE while
 * keeping the exact security contract: revalidation still runs on every
 * request, so demotion/deactivation still takes effect within one
 * request cycle.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const raw = await auth();
  if (!raw?.user?.id || !raw.user.role) return null;
  const u = raw.user as typeof raw.user & {
    personId?: string | null;
    employerId?: string | null;
    isOwner?: boolean;
  };
  return {
    user: {
      id: u.id ?? '',
      email: u.email ?? '',
      name: u.name ?? '',
      role: u.role as UserRole,
      personId: u.personId ?? null,
      employerId: u.employerId ?? null,
      isOwner: u.isOwner === true,
    },
  };
});

/**
 * Require an authenticated session. Redirects to /login if missing OR revoked.
 * Use this in server components and server actions.
 */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

/**
 * Every internal-user role. Any of these can read the CRM chrome;
 * finer-grained gating (e.g. FINANCE-only payment mutations, ADMIN-only
 * user management) happens at the service/action layer with a specific
 * `requireRole([...])` call.
 *
 * Legacy CANDIDATE/EMPLOYER portal roles are still in the DB enum for
 * back-compat (no rows in prod), but are unreachable in the app — the
 * portal was removed.
 */
export const INTERNAL_STAFF_ROLES = [
  'ADMIN',
  'STAFF',
  'MANAGER',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'FINANCE',
] as const satisfies readonly UserRole[];

export type InternalStaffRole = (typeof INTERNAL_STAFF_ROLES)[number];

/** Internal staff role check — throws AuthorizationError for any other role. */
export async function requireRole(roles: UserRole[]): Promise<Session> {
  const s = await requireSession();
  if (!roleSatisfies(s.user, roles)) {
    await logAuthDenied(s.user.id, 'role', { required: roles, actual: s.user.role });
    throw new AuthorizationError();
  }
  return s;
}

/**
 * Convenience — succeeds for any internal user (ADMIN / STAFF /
 * MANAGER / RECRUITER / DOCUMENT_SPECIALIST / FINANCE). Use this
 * where the previous check was `requireRole(['ADMIN','STAFF'])` and
 * you want to future-proof against role splits without listing every
 * internal role by name.
 */
export async function requireInternalStaff(): Promise<Session> {
  return requireRole([...INTERNAL_STAFF_ROLES]);
}

/**
 * Session 33 — gate reserved for the business owner(s). Only owners can
 * reassign records between staff (absence handoffs) and only owners can
 * grant/revoke the owner flag on other users. Multiple owners are
 * supported; this check succeeds for any user whose `isOwner` flag is
 * true, not just the first-seeded owner.
 */
export async function requireOwner(): Promise<Session> {
  const s = await requireSession();
  if (!s.user.isOwner) {
    await logAuthDenied(s.user.id, 'role', { required: ['OWNER'], actual: s.user.role });
    throw new AuthorizationError();
  }
  return s;
}

// ─── Fine-grained permission checks ───────────────────────────────────────

/**
 * Snapshot of a user's permission state. Loaded on demand by
 * `requirePermission` so pages that don't gate anything don't pay the
 * extra query.
 */
type PermissionSnapshot = {
  userId: string;
  isOwner: boolean;
  granted: Set<string>;
};

/**
 * Load the user's owner flag + granted permissions in a single trip.
 *
 * Wrapped in React `cache()` so multiple `requirePermission` /
 * `checkPermission` / `loadCurrentUserPermissions` calls inside the
 * same server render share ONE round-trip (two SQL queries) instead
 * of firing per-fetch. Cache is scoped per React request — no
 * cross-request bleed.
 *
 * Before caching, a dashboard render triggered 12–14 queries
 * (users + user_permissions per gated fetch); with `cache()` it's 2
 * total for a non-owner and 1 for an owner. Big win on Neon where
 * every round-trip is ~150ms transatlantic.
 */
const loadPermissions = cache(async (userId: string): Promise<PermissionSnapshot> => {
  const [userRow] = await db
    .select({ isOwner: users.isOwner })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) throw new AuthorizationError();

  if (userRow.isOwner) {
    // Owner bypasses everything — no need to load the grants table.
    return { userId, isOwner: true, granted: new Set() };
  }

  const rows = await db
    .select({
      business: userPermissions.business,
      module: userPermissions.module,
      verb: userPermissions.verb,
    })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  const granted = new Set(
    rows.map((r) => encodeKey(r.business as Business, r.module, r.verb as Verb)),
  );
  return { userId, isOwner: false, granted };
});

/**
 * Assert the current user has `verb` on `(business, module)`. Owner
 * bypasses. Throws `AuthorizationError` on failure; the calling
 * page/action bubbles that up as a 403.
 */
export async function requirePermission(
  business: Business,
  module: string,
  verb: Verb,
): Promise<Session> {
  const s = await requireSession();
  const snap = await loadPermissions(s.user.id);
  if (snap.isOwner) return s;
  if (!hasPermission(snap.granted, business, module, verb)) {
    await logAuthDenied(s.user.id, 'permission', { business, module, verb });
    throw new AuthorizationError();
  }
  return s;
}

/**
 * Non-throwing variant — returns a boolean. Useful for conditional UI
 * (e.g. "show the Delete button only if the user can delete").
 */
export async function checkPermission(
  business: Business,
  module: string,
  verb: Verb,
): Promise<boolean> {
  const s = await getSession();
  if (!s) return false;
  const snap = await loadPermissions(s.user.id);
  if (snap.isOwner) return true;
  return hasPermission(snap.granted, business, module, verb);
}

/**
 * Pass any of a set of triples. Useful for pages that logically belong
 * to two workspaces (e.g. `/payments` is both
 * `candidate_services.payments` and `main.accounts`). The user gets
 * through if ANY of the listed grants is satisfied.
 */
export async function requireAnyPermission(
  triples: Array<{ business: Business; module: string; verb: Verb }>,
): Promise<Session> {
  const s = await requireSession();
  const snap = await loadPermissions(s.user.id);
  if (snap.isOwner) return s;
  for (const t of triples) {
    if (hasPermission(snap.granted, t.business, t.module, t.verb)) return s;
  }
  await logAuthDenied(s.user.id, 'any_permission', { triples });
  throw new AuthorizationError();
}

/**
 * Fetch the user's full permission snapshot — useful for building the
 * sidebar nav server-side (filter modules the user can view).
 */
export async function loadCurrentUserPermissions(): Promise<PermissionSnapshot | null> {
  const s = await getSession();
  if (!s) return null;
  return loadPermissions(s.user.id);
}
