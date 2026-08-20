import type { UserRole } from '@/lib/db/schema/users';
import { AuthenticationError, AuthorizationError } from '../errors';
import { auth } from './config';

export type Session = {
  user: { id: string; email: string; name: string; role: UserRole };
};

export async function getSession(): Promise<Session | null> {
  const raw = await auth();
  if (!raw?.user?.id || !raw.user.role) return null;
  return {
    user: {
      id: raw.user.id,
      email: raw.user.email ?? '',
      name: raw.user.name ?? '',
      role: raw.user.role,
    },
  };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthenticationError();
  return s;
}

export async function requireRole(roles: UserRole[]): Promise<Session> {
  const s = await requireSession();
  if (!roles.includes(s.user.role)) throw new AuthorizationError();
  return s;
}
