import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { userPermissions } from '@/lib/db/schema/permissions';
import { type UserRole, users } from '@/lib/db/schema/users';
import { AuthorizationError } from '../errors';
import { auth } from './config';
import { type Business, encodeKey, hasPermission, type Verb } from './permissions';

export type Session = {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    personId: string | null;
    employerId: string | null;
  };
};

export async function getSession(): Promise<Session | null> {
  const raw = await auth();
  if (!raw?.user?.id || !raw.user.role) return null;
  const u = raw.user as typeof raw.user & { personId?: string | null; employerId?: string | null };
  return {
    user: {
      id: u.id ?? '',
      email: u.email ?? '',
      name: u.name ?? '',
      role: u.role as UserRole,
      personId: u.personId ?? null,
      employerId: u.employerId ?? null,
    },
  };
}

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
 * `requireRole([...])` call. Portal roles (CANDIDATE/EMPLOYER) are
 * intentionally excluded.
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

/** Internal staff role check. Portal users (CANDIDATE/EMPLOYER) get AuthorizationError. */
export async function requireRole(roles: UserRole[]): Promise<Session> {
  const s = await requireSession();
  if (!roles.includes(s.user.role)) throw new AuthorizationError();
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

/** Portal candidate. Returns the scoped Person ID so downstream queries filter correctly. */
export async function requirePortalCandidate(): Promise<Session & { user: { personId: string } }> {
  const s = await requireSession();
  if (s.user.role !== 'CANDIDATE' || !s.user.personId) {
    throw new AuthorizationError();
  }
  return s as Session & { user: { personId: string } };
}

/** Portal employer. Returns the scoped Employer ID so downstream queries filter correctly. */
export async function requirePortalEmployer(): Promise<Session & { user: { employerId: string } }> {
  const s = await requireSession();
  if (s.user.role !== 'EMPLOYER' || !s.user.employerId) {
    throw new AuthorizationError();
  }
  return s as Session & { user: { employerId: string } };
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
 * Not memoised — every call goes to the DB. Callers are expected to
 * check permissions once per page, not per component; if we ever see
 * this in a hot loop, we can add a per-request cache via React
 * `cache()` here without touching call sites.
 */
async function loadPermissions(userId: string): Promise<PermissionSnapshot> {
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
}

/**
 * Assert the current user has `verb` on `(business, module)`. Owner
 * bypasses. Portal users always fail (they don't have granted
 * permissions in this table and are not the owner).
 *
 * Throws `AuthorizationError` on failure; the calling page/action
 * bubbles that up as a 403.
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
 * Fetch the user's full permission snapshot — useful for building the
 * sidebar nav server-side (filter modules the user can view).
 */
export async function loadCurrentUserPermissions(): Promise<PermissionSnapshot | null> {
  const s = await getSession();
  if (!s) return null;
  return loadPermissions(s.user.id);
}
