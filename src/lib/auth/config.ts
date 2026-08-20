import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { logger } from '@/lib/logger';
import { LoginSchema } from '@/modules/auth/schemas';
import { verifyCredentials } from '@/modules/auth/service';
import { authEdgeConfig } from './edge-config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authEdgeConfig,
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        try {
          const user = await verifyCredentials(parsed.data.email, parsed.data.password);
          if (!user) return null;
          return user;
        } catch (e) {
          logger.error({ err: e }, 'authorize threw');
          return null;
        }
      },
    }),
  ],
});
