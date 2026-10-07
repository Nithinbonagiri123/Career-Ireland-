// `./_bootstrap-env` must be the first import: it sets placeholder values
// for the AUTH_SECRET / AUTH_URL / AWS_REGION / S3_BUCKET_DOCUMENTS keys
// that env.ts's zod validator demands at module load. Only DATABASE_URL
// is actually used by this script.
import './_bootstrap-env';
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

/**
 * ─── RESET-DATA — hand-off cleaner ───────────────────────────────────
 *
 * Purpose: wipe operational/customer data from the DB and leave behind
 * a clean copy that still has:
 *   - Working app configuration (currencies, services, document types,
 *     skills, qualifications, occupations, permissions catalogue, chart
 *     of accounts, business divisions, accounting rules, app_settings)
 *   - Your user accounts (so you can log in and confirm the wipe)
 *   - The migration-tracking table (so CI doesn't re-apply migrations)
 *
 * Wipes everything else: candidates, employers, invoices, payments,
 * receipts, credit notes, placements, offers, applications,
 * immigration cases, documents, audit log, journal entries, financial
 * events, notifications, campaigns, interviews, attendance etc.
 *
 * Resets `document_sequences.current_value` to 0 so the next invoice
 * after this script runs is INV-YYYY-000001 fresh.
 *
 * Safety:
 *   - Runs in DRY_RUN mode by default. Reports what it WOULD do and
 *     exits without touching anything.
 *   - Set `DRY_RUN=false` to actually execute.
 *   - Uses `TRUNCATE ... CASCADE` so FK dependencies cascade correctly.
 *   - Reads the live table list from information_schema — tables that
 *     don't exist (e.g. Phase 7 AP tables before 0041 is applied) are
 *     silently skipped.
 *
 * Usage:
 *   # Preview — safe, prints the plan, no changes:
 *   export DATABASE_URL='postgresql://…'
 *   pnpm tsx scripts/reset-data.ts
 *
 *   # Execute — DESTRUCTIVE, irreversible without a backup:
 *   DRY_RUN=false pnpm tsx scripts/reset-data.ts
 *
 * **TAKE A BACKUP FIRST if this URL points at anything you care about:**
 *   pg_dump "$DATABASE_URL" > backup-$(date +%Y-%m-%d).sql
 */

// Tables whose ROWS survive the reset. Everything else gets TRUNCATED CASCADE.
const PRESERVE_TABLES = new Set<string>([
  // Migration tracking — CI uses this to skip already-applied migrations
  '__ic_migrations',

  // User accounts + their permissions. If you want a totally fresh
  // start, remove these two from this set and re-run
  // `pnpm db:seed:admin` after the wipe to recreate an admin.
  'users',
  'user_permissions',

  // App configuration + permissions catalogue
  'app_settings',
  'permissions',

  // Reference vocabularies — dropdowns rely on these
  'currencies',
  'occupation_categories',
  'occupations',
  'skills',
  'qualifications',
  'document_types',
  'document_requirement_rules',
  'service_catalog_items',
  'service_packages',
  'immigration_application_types',
  'business_case_types',

  // Accounting ledger reference data
  'chart_of_accounts',
  'business_divisions',
  'accounting_rules',
  'accounting_periods',
]);

// Tables whose rows are preserved BUT numeric counters are reset to 0
// so that newly-generated document numbers start from
// INV/RCT/CRN/JRN/BILL-YYYY-000001 after the wipe.
const RESET_COUNTER_TABLES = new Set<string>(['document_sequences']);

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
  // 1. Discover every table currently in the DB.
  const allTables = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const toTruncate: string[] = [];
  const toPreserve: string[] = [];
  const toResetCounter: string[] = [];
  for (const row of allTables) {
    if (RESET_COUNTER_TABLES.has(row.table_name)) toResetCounter.push(row.table_name);
    else if (PRESERVE_TABLES.has(row.table_name)) toPreserve.push(row.table_name);
    else toTruncate.push(row.table_name);
  }

  console.log(`\nDatabase has ${allTables.length} tables.\n`);
  console.log(`  Will PRESERVE (data kept as-is):  ${toPreserve.length}`);
  console.log(`  Will RESET counters:              ${toResetCounter.length}`);
  console.log(`  Will TRUNCATE (data wiped):       ${toTruncate.length}\n`);

  console.log('── PRESERVE (rows kept) ────────────────────────────────');
  for (const t of toPreserve) console.log(`   ${t}`);

  console.log('\n── RESET counters (rows kept, numbers back to zero) ──');
  for (const t of toResetCounter) console.log(`   ${t}`);

  console.log('\n── TRUNCATE (rows wiped) ──────────────────────────────');
  for (const t of toTruncate) console.log(`   ${t}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made.');
    console.log('To actually execute, re-run with:  DRY_RUN=false pnpm tsx scripts/reset-data.ts');
    console.log('BACKUP FIRST:  pg_dump "$DATABASE_URL" > backup-$(date +%Y-%m-%d).sql\n');
    process.exit(0);
  }

  if (toTruncate.length === 0) {
    console.log('\nNothing to truncate. Exiting.');
    process.exit(0);
  }

  // 2. TRUNCATE every non-preserved table in one statement. CASCADE
  // handles FK dependencies between operational tables; preserved
  // tables are not touched because they're not in the list.
  console.log('\nExecuting TRUNCATE … CASCADE …');
  const truncateList = toTruncate.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${truncateList} CASCADE`));
  console.log(`✓ Wiped ${toTruncate.length} tables.`);

  // 3. Reset numbering counters.
  for (const t of toResetCounter) {
    await db.execute(sql.raw(`UPDATE "${t}" SET current_value = 0`));
    console.log(`✓ Reset counters in ${t}.`);
  }

  // 4. Confirm users survived (so the operator can still log in).
  const [userCount] = await db.execute<{ n: string }>(sql`SELECT COUNT(*)::text AS n FROM users`);
  console.log(`\n✓ ${userCount?.n ?? '0'} user account(s) retained — you can still log in.`);
  console.log('✓ Reset complete. Ready to hand over.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n✗ reset failed:', err);
  process.exit(1);
});
