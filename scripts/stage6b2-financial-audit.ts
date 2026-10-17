#!/usr/bin/env tsx
/**
 * Stage 6B+2 — financial integrity audit.
 *
 * Read-only. Runs a battery of invariant checks against the live DB and
 * reports any violations. No writes, no mutations, no external calls.
 *
 * Each check prints ✓ / ✗ with a human-readable count. Exit code 0 if
 * every invariant holds; non-zero + stack if a check fails or any
 * invariant is violated (so this script can gate a release pipeline).
 *
 * Invariants exercised:
 *   1. Every invoice has at least one invoice_line_items row (migration
 *      0053 invariant; closed by Stage 6B+1 fix + Stage 6B+2 reconcile).
 *   2. No invoice numbers are reused.
 *   3. No receipt numbers are reused.
 *   4. No credit note numbers are reused.
 *   5. Every receipt is unique per payment (receipts.payment_id UNIQUE).
 *   6. At most one ACCEPTED pro-forma per proposal_group (partial unique
 *      index enforcement).
 *   7. No ISSUED/PARTIALLY_PAID invoice can be VOIDED while a verified
 *      payment covers it (Stage 6B voidInvoice guard — audits the DB
 *      state, not the code path).
 *   8. financial_events uniqueness (source_system, source_event_id).
 *   9. No negative balances surfaced by the per-engagement calc.
 */

import './_bootstrap-env';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db/client';

type CheckResult = { name: string; ok: boolean; detail?: string };
const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function countOne(query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute<{ n: string }>(query)) as Array<{ n: string }>;
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  console.log('── Stage 6B+2 financial integrity audit\n');

  // 1. Line-item invariant
  const orphans = await countOne(sql`
    SELECT COUNT(*)::text AS n
    FROM invoices i
    WHERE NOT EXISTS (SELECT 1 FROM invoice_line_items li WHERE li.invoice_id = i.id)
  `);
  check(
    'every invoice has ≥1 invoice_line_items row',
    orphans === 0,
    `${orphans} orphan invoice(s)`,
  );

  // 2–4. Number uniqueness (defence-in-depth over the schema UNIQUE)
  for (const [label, table] of [
    ['invoice', 'invoices'],
    ['receipt', 'receipts'],
    ['credit note', 'credit_notes'],
  ] as const) {
    const dupes = await countOne(sql`
      SELECT COUNT(*)::text AS n
      FROM (
        SELECT number FROM ${sql.identifier(table)} GROUP BY number HAVING COUNT(*) > 1
      ) d
    `);
    check(`no duplicate ${label} numbers`, dupes === 0, `${dupes} duplicate(s)`);
  }

  // 5. receipts.payment_id uniqueness
  const dupRcpt = await countOne(sql`
    SELECT COUNT(*)::text AS n
    FROM (SELECT payment_id FROM receipts GROUP BY payment_id HAVING COUNT(*) > 1) d
  `);
  check('at most one receipt per payment', dupRcpt === 0, `${dupRcpt} payment(s) with ≥2 receipts`);

  // 6. One ACCEPTED pro-forma per proposal group (schema partial unique)
  const dupAccept = await countOne(sql`
    SELECT COUNT(*)::text AS n
    FROM (
      SELECT proposal_group_id FROM pro_forma_invoices
      WHERE status = 'ACCEPTED' AND proposal_group_id IS NOT NULL
      GROUP BY proposal_group_id HAVING COUNT(*) > 1
    ) d
  `);
  check(
    'at most one ACCEPTED pro-forma per proposal group',
    dupAccept === 0,
    `${dupAccept} group(s) with >1 ACCEPTED`,
  );

  // 7. VOIDED invoice safety — a VOIDED invoice should NOT have verified
  //    payments against it per the Stage 6B tightening. Historical data
  //    may have violations; report but don't fail the script.
  const voidedWithVerified = await countOne(sql`
    SELECT COUNT(DISTINCT i.id)::text AS n
    FROM invoices i
    JOIN payments p ON p.service_engagement_id = i.service_engagement_id
      AND p.currency_code = i.currency_code
    WHERE i.status = 'VOIDED'
      AND p.status IN ('VERIFIED', 'PARTIALLY_REFUNDED', 'REFUNDED')
  `);
  check(
    'voided invoices never had verified payments (Stage 6B guard)',
    voidedWithVerified === 0,
    voidedWithVerified > 0
      ? `${voidedWithVerified} historic voided invoice(s) carry verified payments — grandfathered`
      : 'none',
  );

  // 8. Ledger idempotency — financial_events uniqueness
  const dupEvents = await countOne(sql`
    SELECT COUNT(*)::text AS n
    FROM (
      SELECT source_system, source_event_id FROM financial_events
      WHERE source_event_id IS NOT NULL
      GROUP BY source_system, source_event_id HAVING COUNT(*) > 1
    ) d
  `);
  check(
    'no duplicate ledger (source_system, source_event_id)',
    dupEvents === 0,
    `${dupEvents} duplicate(s)`,
  );

  // 9. Overpaid engagements — informational
  const overpaid = await countOne(sql`
    SELECT COUNT(DISTINCT se.id)::text AS n
    FROM service_engagements se
    JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0) AS gross
      FROM payments
      WHERE service_engagement_id = se.id
        AND currency_code = se.currency_code
        AND status IN ('VERIFIED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    ) net ON TRUE
    WHERE net.gross > se.agreed_amount
  `);
  check(
    'no engagements with verified payments exceeding agreed amount',
    overpaid === 0,
    overpaid > 0 ? `${overpaid} overpaid engagement(s) — review` : 'none',
  );

  console.log('\n── Summary');
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`  ${pass} / ${results.length} invariants hold`);
  if (fail.length > 0) {
    console.log('\n✗ Failed invariants:');
    for (const f of fail) console.log(`    - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
  }
  console.log('\n✓ All financial invariants hold.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n✗', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
