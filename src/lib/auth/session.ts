import { redirect } from 'next/navigation';
import type { UserRole } from '@/lib/db/schema/users';
import { AuthorizationError } from '../errors';
import { auth } from './config';

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
