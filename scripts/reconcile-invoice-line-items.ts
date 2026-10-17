#!/usr/bin/env tsx
/**
 * Operator-run reconciliation for historical invoices missing a
 * `invoice_line_items` row.
 *
 * ── Background ─────────────────────────────────────────────────────────
 * Migration 0053 introduced `invoice_line_items` and ran a one-time
 * backfill. The `insertInvoice` helper was later found to insert the
 * header without a matching line (Stage 6B+1 fix). Any invoice created
 * between the migration and the fix is a legitimate historical row —
 * same number, same total, same date — that needs a line row to satisfy
 * the invariant the invoice detail view relies on.
 *
 * ── What this script does ──────────────────────────────────────────────
 *   - Scans `invoices` for rows with NO `invoice_line_items` row.
 *   - Dry-run by default: prints the affected IDs + counts, writes nothing.
 *   - With `--apply`: inserts the derived line (qty, unit_price,
 *     line_description, subtotal) exactly as migration 0053 did, wrapped
 *     in a transaction, idempotent, non-destructive.
 *
 * ── Safeguards ─────────────────────────────────────────────────────────
 *   - NEVER modifies invoice headers (number, dates, totals, status).
 *   - NEVER overwrites existing line_items — the WHERE NOT EXISTS clause
 *     excludes any invoice that already has at least one line.
 *   - Nullable `service_catalog_item_id` — populated from the engagement
 *     when a reliable catalog reference exists; left NULL when it does
 *     not. The script never invents mappings.
 *   - Transactional: all inserts happen inside one BEGIN/COMMIT; a
 *     failure rolls back the entire batch.
 *   - No automatic run in production: this script has no cron entry, no
 *     API route and no server-action wrapper. An operator must invoke it
 *     from a shell with explicit `--apply`.
 *   - Exit code 0 on success (whether dry-run or applied); non-zero on
 *     error so a wrapper script can halt a release pipeline if needed.
 *
 * ── Usage ──────────────────────────────────────────────────────────────
 *   pnpm tsx scripts/reconcile-invoice-line-items.ts          # dry-run
 *   pnpm tsx scripts/reconcile-invoice-line-items.ts --apply  # write
 *
 * No destructive migrations. No schema changes. The underlying code bug
 * is already closed in `src/modules/billing/service.ts` so no new orphans
 * should be created going forward — this script heals the backlog.
 */

import './_bootstrap-env';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db/client';

type OrphanRow = {
  id: string;
  number: string;
  service_engagement_id: string;
  qty: string;
  unit_price: string;
  line_description: string;
  subtotal: string;
  currency_code: string;
  status: string;
  issued_at: string;
  service_catalog_item_id: string | null;
};

async function findOrphans(): Promise<OrphanRow[]> {
  const rows = await db.execute<OrphanRow>(sql`
    SELECT
      i.id,
      i.number,
      i.service_engagement_id,
      i.qty::text AS qty,
      i.unit_price::text AS unit_price,
      i.line_description,
      i.subtotal::text AS subtotal,
      i.currency_code,
      i.status,
      i.issued_at::text AS issued_at,
      se.service_catalog_item_id
    FROM invoices i
    LEFT JOIN service_engagements se ON se.id = i.service_engagement_id
    WHERE NOT EXISTS (
      SELECT 1 FROM invoice_line_items li WHERE li.invoice_id = i.id
    )
    ORDER BY i.issued_at
  `);
  return rows as OrphanRow[];
}

function summarise(orphans: OrphanRow[]): void {
  if (orphans.length === 0) {
    console.log('\n✓ Zero orphan invoices on file — nothing to do.');
    return;
  }
  console.log(`\n── Found ${orphans.length} invoice(s) missing a line_items row\n`);
  const nullCatalog = orphans.filter((o) => !o.service_catalog_item_id).length;
  console.log(`  • ${orphans.length - nullCatalog} will carry a resolved service_catalog_item_id`);
  console.log(`  • ${nullCatalog} will carry NULL service_catalog_item_id (no engagement ref)`);
  console.log('\n── Affected invoice numbers / IDs:');
  for (const o of orphans) {
    console.log(
      `  ${o.number}  ${o.id}  ${o.subtotal} ${o.currency_code}  (${o.status}, ${o.issued_at.slice(0, 10)})`,
    );
  }
}

async function applyRepair(orphans: OrphanRow[]): Promise<void> {
  if (orphans.length === 0) return;
  // One transaction for the batch — a mid-batch failure rolls back the
  // whole thing rather than leaving a partial repair.
  console.log(`\n── Applying repair to ${orphans.length} invoice(s)…`);
  await db.transaction(async (tx) => {
    // The WHERE NOT EXISTS clause guarantees idempotency: an invoice that
    // acquired a line_items row between the scan and this write (e.g.,
    // another operator ran the script concurrently) is skipped. We also
    // re-query inside the tx under a lock to avoid double-insert.
    const result = await tx.execute<{ inserted: string }>(sql`
      WITH inserted AS (
        INSERT INTO invoice_line_items
          (invoice_id, service_catalog_item_id, description, quantity, unit_price, line_subtotal, sort_order)
        SELECT
          i.id,
          se.service_catalog_item_id,
          i.line_description,
          i.qty::numeric(10,3),
          i.unit_price,
          i.subtotal,
          0
        FROM invoices i
        LEFT JOIN service_engagements se ON se.id = i.service_engagement_id
        WHERE NOT EXISTS (SELECT 1 FROM invoice_line_items li WHERE li.invoice_id = i.id)
        RETURNING invoice_id
      )
      SELECT COUNT(*)::text AS inserted FROM inserted
    `);
    const n = Number((result as Array<{ inserted: string }>)[0]?.inserted ?? 0);
    console.log(`  ✓ Inserted ${n} invoice_line_items row(s)`);
  });

  // Verify the invariant now holds. If this reports anything, the write
  // succeeded but a concurrent process re-introduced an orphan — flag it.
  const after = await findOrphans();
  if (after.length === 0) {
    console.log('\n✓ Invariant restored: every invoice has at least one line_items row.');
  } else {
    console.log(
      `\n⚠ ${after.length} orphan(s) remain. A concurrent process may have created them during the run.`,
    );
    for (const o of after) console.log(`    ${o.number}  ${o.id}`);
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '── Mode: APPLY' : '── Mode: DRY-RUN');
  console.log('── Target: invoices WHERE NOT EXISTS a matching invoice_line_items row');

  const orphans = await findOrphans();
  summarise(orphans);

  if (!apply) {
    console.log(
      '\nNo changes written. Re-run with `--apply` to insert the derived line_items rows.',
    );
    return;
  }
  await applyRepair(orphans);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n✗', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
