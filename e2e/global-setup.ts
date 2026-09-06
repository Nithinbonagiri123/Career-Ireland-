import { mkdirSync } from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local BEFORE any module that touches env.ts (that would validate too early).
loadEnv({ path: '.env.local' });

export const E2E_ADMIN = {
  email: 'e2e-admin@ireland-careers.test',
  fullName: 'E2E Admin',
  // 16 chars, meets password policy (upper + lower + digit + symbol), doesn't
  // contain 'e2e' or 'admin' as substrings would only fire on 4+ chars matching
  // the local-part 'e2e-admin' — 'e2e-' is 4 chars but that's not in the pw.
  password: 'Ir3land-Careers!23',
};

async function ensureAdminUser() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  // Import argon2 directly — src/modules/auth/service uses the @/ alias which
  // Playwright's globalSetup runner doesn't resolve. Mirror the app's argon2 settings.
  const argon2 = (await import('argon2')).default;
  const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  } as const;
  const hash = (pw: string) => argon2.hash(pw, ARGON2_OPTIONS);

  const [existing] = await db.select().from(users).where(eq(users.email, E2E_ADMIN.email)).limit(1);
  if (existing) {
    const passwordHash = await hash(E2E_ADMIN.password);
    await db
      .update(users)
      .set({
        passwordHash,
        isActive: true,
        sessionsInvalidatedAfter: new Date(),
      })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  const passwordHash = await hash(E2E_ADMIN.password);
  const [created] = await db
    .insert(users)
    .values({
      email: E2E_ADMIN.email,
      fullName: E2E_ADMIN.fullName,
      passwordHash,
      role: 'ADMIN',
    })
    .returning({ id: users.id });
  if (!created) throw new Error('failed to seed e2e admin');
  return created.id;
}

async function ensureBaselineCurrencies() {
  const { db } = await import('../src/lib/db/client');
  const { currencies } = await import('../src/lib/db/schema/currencies');
  const rows = [
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'GBP', name: 'Pound Sterling', symbol: '£' },
  ];
  for (const c of rows) {
    await db.insert(currencies).values(c).onConflictDoNothing({ target: currencies.code });
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

  console.log('▸ Seeding baseline currencies…');
  await ensureBaselineCurrencies();
  console.log('  ✓ EUR / USD / GBP');

  console.log('▸ Seeding E2E admin user…');
  await ensureAdminUser();
  console.log(`  ✓ ${E2E_ADMIN.email}`);

  console.log('▸ Logging in + saving session…');
  mkdirSync('playwright/.auth', { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(E2E_ADMIN.email);
  await page.getByLabel(/password/i).fill(E2E_ADMIN.password);
  // Exact 'Login' — the SSO buttons on the page also match 'Sign in'.
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // Wait for post-login redirect (dashboard or app root).
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  await context.storageState({ path: 'playwright/.auth/admin.json' });
  console.log('  ✓ session saved to playwright/.auth/admin.json');
  await browser.close();
}
