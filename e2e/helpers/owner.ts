/**
 * Record ownership in fixtures. In the app every employer, job, lead,
 * candidate profile and immigration case is owned by the user who creates
 * it, so rows a browser test seeds belong to the user the test signs in as:
 * the E2E admin (see E2E_ADMIN in global-setup.ts). Looked up once per
 * worker and cached.
 */
const E2E_ADMIN_EMAIL = 'e2e-admin@ireland-careers.test';

let cached: Promise<string> | null = null;

export function e2eAdminId(): Promise<string> {
  cached ??= (async () => {
    const { config: loadEnv } = await import('dotenv');
    loadEnv({ path: '.env.local' });
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../../src/lib/db/client');
    const { users } = await import('../../src/lib/db/schema/users');
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, E2E_ADMIN_EMAIL))
      .limit(1);
    if (!admin) throw new Error('E2E admin user missing (global setup seeds it)');
    return admin.id;
  })();
  return cached;
}
