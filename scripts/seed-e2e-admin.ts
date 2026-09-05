/**
 * Non-interactive, idempotent seed for the E2E admin user.
 *
 * Consumed by:
 *   - CI (before running vitest + Playwright)
 *   - Local dev (`pnpm tsx scripts/seed-e2e-admin.ts`)
 *   - e2e/global-setup.ts already does the same work when Playwright boots,
 *     but the DB-dependent vitest tests (task-generator.race, interviews/
 *     conflict) also need this row to exist and can't spin up a browser.
 *
 * Credentials mirror e2e/global-setup.ts's E2E_ADMIN constant. Never use
 * these on any real user-facing environment.
 */

import { config } from 'dotenv';

// Load env BEFORE any import that transitively loads src/lib/env.ts.
config({ path: '.env.local' });

const E2E_ADMIN = {
  email: 'e2e-admin@ireland-careers.test',
  fullName: 'E2E Admin',
  password: 'Ir3land-Careers!23',
};

async function main() {
  const { eq } = await import('drizzle-orm');
  const argon2 = (await import('argon2')).default;
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');

  // Mirror src/modules/auth/service.ts's ARGON2_OPTIONS so the hash format
  // matches what the login flow expects.
  const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  } as const;
  const passwordHash = await argon2.hash(E2E_ADMIN.password, ARGON2_OPTIONS);

  const [existing] = await db.select().from(users).where(eq(users.email, E2E_ADMIN.email)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        isActive: true,
        sessionsInvalidatedAfter: new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`✓ Updated E2E admin: ${E2E_ADMIN.email} (id=${existing.id})`);
    process.exit(0);
  }

  const [created] = await db
    .insert(users)
    .values({
      email: E2E_ADMIN.email,
      fullName: E2E_ADMIN.fullName,
      passwordHash,
      role: 'ADMIN',
    })
    .returning({ id: users.id });
  if (!created) throw new Error('failed to insert E2E admin');
  console.log(`✓ Created E2E admin: ${E2E_ADMIN.email} (id=${created.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ seed-e2e-admin failed:', err);
  process.exit(1);
});
