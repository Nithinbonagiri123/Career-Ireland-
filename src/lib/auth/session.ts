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

/** Internal staff role check. Portal users (CANDIDATE/EMPLOYER) get AuthorizationError. */
export async function requireRole(roles: UserRole[]): Promise<Session> {
  const s = await requireSession();
  if (!roles.includes(s.user.role)) throw new AuthorizationError();
  return s;
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
