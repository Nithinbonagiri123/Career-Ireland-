import { config } from 'dotenv';

config({ path: '.env.local' });

const SEED = [
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£' },
] as const;

async function main() {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { currencies } = await import('../src/lib/db/schema/currencies');

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const c of SEED) {
    const result = await db
      .insert(currencies)
      .values(c)
      .onConflictDoNothing({ target: currencies.code })
      .returning({ code: currencies.code });
    if (result.length > 0) inserted.push(c.code);
    else skipped.push(c.code);
  }

  // Reference sql to avoid unused-import warning when the loop above already terminated cleanly.
  void sql;

  console.log(`\n✓ Currencies seed complete`);
  if (inserted.length > 0) console.log(`  inserted: ${inserted.join(', ')}`);
  if (skipped.length > 0) console.log(`  already present: ${skipped.join(', ')}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
