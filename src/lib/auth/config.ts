import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { UserRole } from '@/lib/db/schema/users';
import { logger } from '@/lib/logger';
import { isLoginBlocked, recordLoginAttempt } from '@/modules/auth/login-throttle';
import { findUserById } from '@/modules/auth/repository';
import { LoginSchema } from '@/modules/auth/schemas';
import { verifyCredentials } from '@/modules/auth/service';
import { authEdgeConfig } from './edge-config';

function readClientIp(req: Request | undefined): string | null {
  if (!req) return null;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}

/**
 * Full auth config (Node runtime). Reuses the edge-safe callbacks and adds:
 *  - the Credentials provider (imports argon2, DB — Node only)
 *  - a jwt callback that revalidates the session against the users table:
 *      * account still active?
 *      * JWT.iat >= user.sessionsInvalidatedAfter?
 *    If either check fails, we return null → session becomes null → requireSession
 *    redirects to /login. See feedback_reuse_functionality memory: single source of
 *    truth for auth checks.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authEdgeConfig,
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        const ip = readClientIp(req as Request | undefined);

        // Refuse further attempts once the sliding-window failure budget is
        // exhausted for this email or this IP — before we spend argon2 CPU.
        if (await isLoginBlocked(email, ip)) {
          logger.warn({ email, ip }, 'login refused: rate-limited');
          return null;
        }

        try {
          const user = await verifyCredentials(email, parsed.data.password);
          void recordLoginAttempt(email, ip, user ? 'SUCCESS' : 'FAILURE');
          return user ?? null;
        } catch (e) {
          logger.error({ err: e }, 'authorize threw');
          void recordLoginAttempt(email, ip, 'FAILURE');
          return null;
        }
      },
    }),
  ],
  callbacks: {
    ...authEdgeConfig.callbacks,
    async jwt(params) {
      // Sign-in path: user object present, seed the token from it.
      const edgeToken = await authEdgeConfig.callbacks?.jwt?.(params);
      const token = edgeToken ?? params.token;
      if (params.user) return token;

      // Existing-session path: revalidate against DB.
      const t = token as { id?: string; iat?: number };
      if (!t.id || typeof t.iat !== 'number') return token;

      try {
        const dbUser = await findUserById(t.id);
        if (!dbUser?.isActive) return null; // deactivated or gone → force re-login
        const invalidatedAtSec = Math.floor(dbUser.sessionsInvalidatedAfter.getTime() / 1000);
        if (t.iat < invalidatedAtSec) return null; // role/access changed → force re-login
        // Refresh role + scope in case they changed (belt-and-braces since invalidation should have fired).
        return {
          ...token,
          role: dbUser.role as UserRole,
          personId: dbUser.personId,
          employerId: dbUser.employerId,
        };
      } catch (e) {
        logger.error({ err: e, userId: t.id }, 'jwt DB revalidation failed');
        // On DB failure, don't sign the user out — degrade gracefully to previous token.
        return token;
      }
    },
  },
});
