import type { NextAuthConfig } from 'next-auth';
import type { UserRole } from '@/lib/db/schema/users';

/**
 * Edge-safe Auth.js config. Contains NO Node-only imports (no argon2, no DB).
 * The middleware imports this so it stays runnable in edge runtime.
 * The full config in `./config.ts` spreads this and adds the Credentials
 * provider whose authorize() lives in Node.
 */
export const authEdgeConfig: NextAuthConfig = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          id: (user as { id?: string }).id,
          role: (user as { role?: UserRole }).role,
          personId: (user as { personId?: string | null }).personId ?? null,
          employerId: (user as { employerId?: string | null }).employerId ?? null,
        };
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as {
        id?: string;
        role?: UserRole;
        personId?: string | null;
        employerId?: string | null;
      };
      if (session.user && t.id) {
        session.user.id = t.id;
        if (t.role) session.user.role = t.role;
        (session.user as { personId?: string | null }).personId = t.personId ?? null;
        (session.user as { employerId?: string | null }).employerId = t.employerId ?? null;
      }
      return session;
    },
  },
};
