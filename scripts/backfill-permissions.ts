import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * One-shot backfill: populate `user_permissions` for every existing
 * user based on their current role, using the presets defined in
 * `src/lib/auth/permissions.ts`.
 *
 * Idempotent — safe to re-run. Uses ON CONFLICT DO NOTHING so existing
 * grants aren't overwritten. Portal users (CANDIDATE/EMPLOYER) get no
 * grants (their preset is intentionally empty).
 *
 *   Usage:  pnpm tsx scripts/backfill-permissions.ts
 */

async function main() {
  const { inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  const { userPermissions } = await import('../src/lib/db/schema/permissions');
  const permissionsMod = await import('../src/lib/auth/permissions');
  const { presetForRole } = permissionsMod;
  type Role = Parameters<typeof presetForRole>[0];

  const staffRoles: Role[] = [
    'ADMIN',
    'STAFF',
    'MANAGER',
    'RECRUITER',
    'DOCUMENT_SPECIALIST',
    'FINANCE',
  ];

  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(inArray(users.role, staffRoles));

  console.log(`▶ Backfilling permissions for ${rows.length} staff users…`);

  let inserted = 0;
  for (const u of rows) {
    const preset = presetForRole(u.role as Role);
    if (preset.length === 0) {
      console.log(`  ${u.email} (${u.role}) — empty preset, skipped`);
      continue;
    }
    const values = preset.map((k) => ({
      userId: u.id,
      business: k.business,
      module: k.module,
      verb: k.verb,
    }));
    // Chunk if the preset is large (ADMIN = 115 rows). Postgres has no
    // hard limit here but the drizzle typing prefers small batches.
    const CHUNK = 50;
    for (let i = 0; i < values.length; i += CHUNK) {
      const slice = values.slice(i, i + CHUNK);
      const result = await db.insert(userPermissions).values(slice).onConflictDoNothing();
      inserted += Array.isArray(result) ? result.length : slice.length;
    }
    console.log(`  ${u.email} (${u.role}) — ${preset.length} grants seeded`);
  }

  console.log(`\n✔ Done. Grants processed: ~${inserted}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✖ Backfill failed:', err);
    process.exit(1);
  });
