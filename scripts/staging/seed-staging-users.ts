/**
 * Staging test accounts (release-prep requirement 5) — non-interactive
 * variant of seed-admin for the staging bootstrap.
 *
 * Creates exactly two users for main-user acceptance testing:
 *   - owner/ADMIN  (STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD)
 *   - plain STAFF with NO grants (STAGING_STAFF_EMAIL / STAGING_STAFF_PASSWORD)
 *     so the tightened permission model can be verified first-hand.
 *
 * Idempotent: existing emails are left untouched. Runs ONLY via the
 * bootstrap orchestrator, which exports DATABASE_URL from
 * STAGING_DATABASE_URL after the guard has approved the target.
 */
import './_assert-staging';

async function main() {
  const adminEmail = (process.env.STAGING_ADMIN_EMAIL ?? '').toLowerCase();
  const adminPassword = process.env.STAGING_ADMIN_PASSWORD ?? '';
  const staffEmail = (process.env.STAGING_STAFF_EMAIL ?? '').toLowerCase();
  const staffPassword = process.env.STAGING_STAFF_PASSWORD ?? '';
  for (const [k, v] of [
    ['STAGING_ADMIN_EMAIL', adminEmail],
    ['STAGING_ADMIN_PASSWORD', adminPassword],
    ['STAGING_STAFF_EMAIL', staffEmail],
    ['STAGING_STAFF_PASSWORD', staffPassword],
  ]) {
    if (!v) throw new Error(`${k} is required`);
  }
  if (adminPassword.length < 12 || staffPassword.length < 12) {
    throw new Error('Staging passwords must be at least 12 characters.');
  }

  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../../src/lib/db/client');
  const { users } = await import('../../src/lib/db/schema/users');
  const { hashPassword } = await import('../../src/modules/auth/service');

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  const upsert = async (
    email: string,
    fullName: string,
    role: 'ADMIN' | 'STAFF',
    password: string,
    isOwner: boolean,
  ) => {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      console.log(`• ${email} already exists — left untouched.`);
      return;
    }
    await db.insert(users).values({
      email,
      fullName,
      role,
      isOwner,
      passwordHash: await hashPassword(password),
      isActive: true,
    });
    console.log(`✓ created ${role}${isOwner ? ' (owner)' : ''}: ${email}`);
  };

  // First user into an empty users table becomes the owner (same rule as
  // seed-admin) so the staging admin can use the permissions editor.
  await upsert(adminEmail, 'Staging Admin', 'ADMIN', adminPassword, (count ?? 0) === 0);
  await upsert(staffEmail, 'Staging Staff', 'STAFF', staffPassword, false);
  console.log(
    'Note: the STAFF account deliberately has NO permission grants — granting them from the admin UI is part of the test script.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ seed-staging-users failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
