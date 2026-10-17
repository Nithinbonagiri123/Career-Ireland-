import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * Stage 4 — manual lead-expiry sweep. Run after reviewing the design
 * at docs/cs-lead-expiry-eligibility.md. Not wired to a scheduler;
 * operators run it from the shell for Stage 4. A production cron is
 * out of scope.
 *
 * Usage:
 *   pnpm tsx scripts/stage4-expiry-sweep.ts [--dry-run]
 */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const { db } = await import('../src/lib/db/client');
  const { fetchExpirableLeadIds, expireLeads } = await import('../src/modules/leads/expiry');

  if (dryRun) {
    const ids = await fetchExpirableLeadIds(db, {});
    console.log(`Dry-run: ${ids.length} CS lead(s) eligible for automatic expiry.`);
    for (const id of ids) console.log('  -', id);
    process.exit(0);
  }
  const result = await expireLeads();
  console.log(`Expired ${result.expiredIds.length} lead(s), skipped ${result.skippedIds.length}.`);
  for (const id of result.expiredIds) console.log('  ✓', id);
  for (const id of result.skippedIds) console.log('  — skipped:', id);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
