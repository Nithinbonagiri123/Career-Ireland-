import { config } from 'dotenv';

config({ path: '.env.local' });

import postgres from 'postgres';

/**
 * Stage B Wave 1 — READ-ONLY historical duplicate scan (client P0).
 *
 * Reports, without modifying anything:
 *   1. Engagements that carry more than one live (non-VOIDED) invoice —
 *      these would also block migration 0060's unique index, so this
 *      must come back empty before deploying.
 *   2. Suspect duplicate invoices: same payer + same service + same
 *      currency with 2+ live invoices (the "Add another invoice…"
 *      doubling path). Each group needs record-by-record review; the
 *      legal corrections are void (unpaid) or credit note (paid).
 *   3. Part-paid ACCEPTED quotes (engagement exists via payments but
 *      quote not converted) — the population whose displayed balance
 *      was doubled. Informational only: the Wave 1 balance fix corrects
 *      the display with no data change.
 *
 * Usage: pnpm exec tsx scripts/stage-b-duplicate-scan.ts
 * Point DATABASE_URL at the environment you want to scan.
 */
async function main() {
  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

  console.log('— Stage B duplicate scan (read-only) —\n');

  const multiInvoiceEngagements = await sql`
    SELECT i.service_engagement_id,
           COUNT(*) AS live_invoices,
           STRING_AGG(i.number, ', ' ORDER BY i.issued_at) AS numbers
    FROM invoices i
    WHERE i.status != 'VOIDED'
    GROUP BY i.service_engagement_id
    HAVING COUNT(*) > 1
  `;
  console.log(
    `1) Engagements with >1 live invoice (must be 0 before deploying 0060): ${multiInvoiceEngagements.length}`,
  );
  for (const r of multiInvoiceEngagements) {
    console.log(
      `   engagement ${r.service_engagement_id}: ${r.live_invoices} invoices → ${r.numbers}`,
    );
  }

  const suspectGroups = await sql`
    SELECT COALESCE(i.payer_person_id::text, 'employer:' || i.payer_employer_id::text) AS payer,
           COALESCE(p.first_name || ' ' || p.last_name, e.legal_name, '?') AS payer_name,
           sci.name AS service,
           i.currency_code,
           COUNT(*) AS live_invoices,
           STRING_AGG(i.number || ' (' || i.total_amount || ' ' || i.currency_code || ', ' || i.status || ', issued ' || TO_CHAR(i.issued_at, 'YYYY-MM-DD') || ')', ' | ' ORDER BY i.issued_at) AS detail
    FROM invoices i
    JOIN service_engagements se ON se.id = i.service_engagement_id
    JOIN service_catalog_items sci ON sci.id = se.service_catalog_item_id
    LEFT JOIN persons p ON p.id = i.payer_person_id
    LEFT JOIN employers e ON e.id = i.payer_employer_id
    WHERE i.status != 'VOIDED'
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;
  console.log(
    `\n2) Suspect duplicate groups (same payer + service + currency, 2+ live invoices): ${suspectGroups.length}`,
  );
  for (const r of suspectGroups) {
    console.log(`   ${r.payer_name} · ${r.service} · ${r.currency_code}: ${r.detail}`);
  }

  const partPaidQuotes = await sql`
    SELECT pf.number,
           pf.subtotal,
           pf.currency_code,
           COALESCE(p.first_name || ' ' || p.last_name, '?') AS payer_name,
           COUNT(pay.id) AS payments
    FROM pro_forma_invoices pf
    JOIN payments pay ON pay.pro_forma_invoice_id = pf.id
    LEFT JOIN persons p ON p.id = pf.payer_person_id
    WHERE pf.status = 'ACCEPTED'
    GROUP BY pf.id, p.first_name, p.last_name
  `;
  console.log(
    `\n3) Part-paid ACCEPTED quotes (display was doubled; fixed in code, no data change): ${partPaidQuotes.length}`,
  );
  for (const r of partPaidQuotes) {
    console.log(
      `   ${r.number} · ${r.payer_name} · ${r.subtotal} ${r.currency_code} · ${r.payments} payment(s)`,
    );
  }

  // Release-gate verdict: migration 0060 (one live invoice per
  // engagement) can only apply when section 1 is empty. Sections 2 and
  // 3 are review lists, not blockers.
  const blocking = multiInvoiceEngagements.length;
  console.log('\nScan complete. No rows were modified.');
  if (blocking > 0) {
    console.log(
      `\nVERDICT: BLOCK — ${blocking} engagement(s) carry more than one live invoice; ` +
        'migration 0060 would fail. These records need review and an approved correction ' +
        '(void / credit note) before release.',
    );
    await sql.end();
    process.exit(1);
  }
  console.log('\nVERDICT: PASS — migration 0060 can apply; release may proceed.');
  await sql.end();
  process.exit(0);
}
main();
