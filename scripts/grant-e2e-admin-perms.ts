import { config } from 'dotenv';
import { assertLocalDatabase } from './_assert-local-db';

config({ path: '.env.local' });
assertLocalDatabase('grant-e2e-admin-perms');

/**
 * One-off: grant the ADMIN preset to the e2e-admin user. The seed in
 * e2e/global-setup.ts creates the user with role=ADMIN but leaves
 * user_permissions empty, so every requirePermission() check fails and
 * every page returns "You don't have access". Running this once wires
 * up the full ADMIN-preset grants (manage on every module × business).
 *
 * Idempotent: deletes any existing rows for the user and rewrites.
 */
async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { presetForRole } = await import('../src/lib/auth/permissions');
  const { userPermissions } = await import('../src/lib/db/schema/permissions');
  const { users } = await import('../src/lib/db/schema/users');

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!u) {
    console.error('e2e-admin not found. Run `pnpm db:seed:e2e-admin` first.');
    process.exit(1);
  }
  const preset = presetForRole('ADMIN');
  await db.transaction(async (tx) => {
    await tx.delete(userPermissions).where(eq(userPermissions.userId, u.id));
    if (preset.length > 0) {
      await tx.insert(userPermissions).values(
        preset.map((p) => ({
          userId: u.id,
          business: p.business,
          module: p.module,
          verb: p.verb,
        })),
      );
    }
  });
  console.log(`Granted ${preset.length} permission rows to e2e-admin.`);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
