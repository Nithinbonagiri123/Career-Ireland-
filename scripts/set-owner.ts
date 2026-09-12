import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * Designate the business owner. The owner bypasses every permission
 * check and cannot be revoked from within the app — you have to run
 * this script again to transfer ownership.
 *
 *   Usage:  pnpm tsx scripts/set-owner.ts <email>
 *
 * There is deliberately no in-app UI for this. Ownership transfer is a
 * high-stakes operation (the previous owner immediately loses their
 * bypass); requiring a shell + DB access is the intentional friction.
 *
 * Idempotent — if the target is already the owner, this is a no-op.
 * If a different user is the current owner, they lose the flag first
 * (partial unique index enforces exactly one).
 */

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: pnpm tsx scripts/set-owner.ts <email>');
    process.exit(1);
  }

  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');

  const [target] = await db
    .select({ id: users.id, email: users.email, role: users.role, isOwner: users.isOwner })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!target) {
    console.error(`✖ No user with email ${email}`);
    process.exit(1);
  }

  if (target.isOwner) {
    console.log(`  ${target.email} is already the owner. Nothing to do.`);
    process.exit(0);
  }

  if (target.role === 'CANDIDATE' || target.role === 'EMPLOYER') {
    console.error(
      `✖ ${target.email} is a portal user (role=${target.role}). The owner must be an internal staff account.`,
    );
    process.exit(1);
  }

  await db.transaction(async (tx) => {
    // Demote any current owner. Ordering matters — the partial unique
    // index forbids two `true` rows, so we must clear before setting.
    await tx.update(users).set({ isOwner: false }).where(eq(users.isOwner, true));
    await tx.update(users).set({ isOwner: true }).where(eq(users.id, target.id));
  });

  console.log(`✔ ${target.email} is now the business owner.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✖ set-owner failed:', err);
    process.exit(1);
  });
