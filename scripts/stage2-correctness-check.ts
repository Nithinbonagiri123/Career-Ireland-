import { config } from 'dotenv';
import { automatedRunRefusal, exitOnRefusal } from '../src/lib/db/manual-db-guard';

config({ path: '.env.local' });
// Decision 8: never against the manual-testing DB (no override).
exitOnRefusal(automatedRunRefusal('stage2-correctness-check', process.env.DATABASE_URL));

async function main() {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');

  console.log('== Pro formas (last 10 by created_at) ==');
  const pfs = await db.execute(
    sql`SELECT number, status, revision, currency_code, subtotal, created_at FROM pro_forma_invoices ORDER BY created_at DESC LIMIT 10`,
  );
  console.table(pfs);

  console.log('\n== Line items by pro forma (last 10) ==');
  const items = await db.execute(sql`
    SELECT pfi.number, li.description, li.quantity, li.unit_price, li.line_subtotal
    FROM pro_forma_line_items li
    JOIN pro_forma_invoices pfi ON pfi.id = li.pro_forma_invoice_id
    ORDER BY pfi.created_at DESC, li.sort_order
    LIMIT 20
  `);
  console.table(items);

  console.log('\n== Subtotal consistency check (SUM(line_subtotal) vs invoice.subtotal) ==');
  const drift = await db.execute(sql`
    SELECT pfi.number, pfi.subtotal AS header_subtotal,
      COALESCE(SUM(li.line_subtotal), 0)::text AS line_sum,
      (pfi.subtotal::numeric - COALESCE(SUM(li.line_subtotal), 0))::text AS drift
    FROM pro_forma_invoices pfi
    LEFT JOIN pro_forma_line_items li ON li.pro_forma_invoice_id = pfi.id
    GROUP BY pfi.id, pfi.number, pfi.subtotal
    HAVING pfi.subtotal::numeric <> COALESCE(SUM(li.line_subtotal), 0)
  `);
  if (drift.length === 0) {
    console.log('  ✓ No drift — every pro forma subtotal equals sum of its line_subtotals.');
  } else {
    console.log('  ✗ DRIFT FOUND:');
    console.table(drift);
  }

  console.log('\n== Latest revision snapshot (reconstructibility check) ==');
  const revs = await db.execute(sql`
    SELECT pfi.number, r.revision, r.reason, r.snapshot
    FROM pro_forma_revisions r
    JOIN pro_forma_invoices pfi ON pfi.id = r.pro_forma_invoice_id
    ORDER BY r.created_at DESC
    LIMIT 1
  `);
  if (revs.length > 0) {
    const row = revs[0] as {
      number: string;
      revision: number;
      reason: string;
      snapshot: Record<string, unknown>;
    };
    console.log(`  Pro forma: ${row.number}, revision snapshotted: ${row.revision}`);
    console.log(`  Reason: ${row.reason}`);
    console.log('  Snapshot shape:', Object.keys(row.snapshot));
    console.log('  Reconstructed subtotal:', row.snapshot.subtotal);
    console.log('  Reconstructed currency:', row.snapshot.currencyCode);
    console.log(
      '  Reconstructed lines:',
      Array.isArray(row.snapshot.lines) ? (row.snapshot.lines as unknown[]).length : 'MISSING',
    );
  } else {
    console.log('  (no revisions yet)');
  }

  console.log('\n== Audit trail (last 10 pro-forma events) ==');
  const audit = await db.execute(sql`
    SELECT ae.action, ae.occurred_at, pfi.number
    FROM audit_events ae
    JOIN pro_forma_invoices pfi ON pfi.id::text = ae.entity_id
    WHERE ae.entity_type = 'pro_forma_invoice'
    ORDER BY ae.occurred_at DESC
    LIMIT 10
  `);
  console.table(audit);

  console.log('\n== Status distribution ==');
  const dist = await db.execute(
    sql`SELECT status, COUNT(*)::text AS n FROM pro_forma_invoices GROUP BY status ORDER BY status`,
  );
  console.table(dist);

  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
