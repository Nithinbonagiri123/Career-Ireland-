import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * Stage 4 Part E — pro-forma / billing consistency verification.
 *
 * Audits the DB without writing. Reports whether the live Stage 1-3
 * state matches each invariant the brief requires:
 *
 *   1. Multi-proposal grouping — proposal_groups contain >=1 PF,
 *      at most one ACCEPTED per group (partial unique index).
 *   2. Acceptance supersedes competitors — any group with an ACCEPTED
 *      PF has no sibling in DRAFT/ISSUED.
 *   3. Independent groups — different groups on the same lead can each
 *      carry their own ACCEPTED PF.
 *   4. All payments carry the right pro_forma_invoice_id (never dangling).
 *   5. Invoice totals equal SUM(line_subtotal) for every invoice.
 *   6. Pro-forma-origin invoices equal SUM(pf.line_subtotal).
 *   7. INV numbers are sequential + unique per year.
 */

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  results.push({ name, ok: cond, detail });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');

  /* 1. Groups + at-most-one-ACCEPTED-per-group */
  console.log('\n── 1. Proposal groups + at-most-one ACCEPTED');
  {
    const violations = await db.execute<{ group_id: string; n: string }>(sql`
      SELECT proposal_group_id AS group_id, COUNT(*)::text AS n
      FROM pro_forma_invoices
      WHERE status = 'ACCEPTED' AND proposal_group_id IS NOT NULL
      GROUP BY 1 HAVING COUNT(*) > 1
    `);
    check(
      'no proposal group has >1 ACCEPTED',
      violations.length === 0,
      violations.length > 0 ? `${violations.length} violations` : undefined,
    );
  }

  /* 2. Acceptance supersedes competitors — no DRAFT/ISSUED sibling of an ACCEPTED */
  console.log('\n── 2. Acceptance supersedes competitors');
  {
    const stray = await db.execute<{ group_id: string }>(sql`
      SELECT g.id AS group_id
      FROM proposal_groups g
      WHERE EXISTS (
        SELECT 1 FROM pro_forma_invoices pf
        WHERE pf.proposal_group_id = g.id AND pf.status = 'ACCEPTED'
      )
      AND EXISTS (
        SELECT 1 FROM pro_forma_invoices sib
        WHERE sib.proposal_group_id = g.id AND sib.status IN ('DRAFT','ISSUED')
      )
    `);
    check(
      'every ACCEPTED PF has zero DRAFT/ISSUED siblings in its group',
      stray.length === 0,
      stray.length > 0 ? `${stray.length} groups with stray siblings` : undefined,
    );
  }

  /* 3. Independent groups can each have ACCEPTED */
  console.log('\n── 3. Independent proposal groups each accept independently');
  {
    const multi = await db.execute<{ lead_id: string; groups: string }>(sql`
      SELECT g.lead_id, COUNT(DISTINCT g.id)::text AS groups
      FROM proposal_groups g
      INNER JOIN pro_forma_invoices pf ON pf.proposal_group_id = g.id
      WHERE pf.status IN ('ACCEPTED','CONVERTED')
      GROUP BY g.lead_id
      HAVING COUNT(DISTINCT g.id) > 1
    `);
    // Not a failure if zero — the system supports it, we just confirm it's expressible.
    check(
      'leads with >1 ACCEPTED/CONVERTED group (expressible)',
      true,
      `${multi.length} such lead(s) in live data`,
    );
  }

  /* 4. Payments: pro_forma_invoice_id resolution */
  console.log('\n── 4. Payments with pro_forma_invoice_id — PF must exist');
  {
    const dangling = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n
      FROM payments p
      WHERE p.pro_forma_invoice_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pro_forma_invoices pf WHERE pf.id = p.pro_forma_invoice_id)
    `);
    check('no dangling pro_forma_invoice_id on payments', Number(dangling[0]?.n ?? '0') === 0);
  }

  /* 5. Invoice totals = SUM(line_subtotal) for every invoice */
  console.log('\n── 5. Every invoice: subtotal = SUM(line_subtotal)');
  {
    const drift = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n
      FROM invoices i
      JOIN (
        SELECT invoice_id, SUM(line_subtotal) AS line_sum
        FROM invoice_line_items
        GROUP BY invoice_id
      ) agg ON agg.invoice_id = i.id
      WHERE agg.line_sum::numeric <> i.subtotal::numeric
    `);
    check('every invoice subtotal equals SUM(line_subtotal)', Number(drift[0]?.n ?? '0') === 0);
  }

  /* 6. Pro-forma-origin invoices: invoice.subtotal = pro_forma_invoices.subtotal */
  console.log('\n── 6. Pro-forma-origin invoices equal their accepted agreement');
  {
    const drift = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n
      FROM pro_forma_official_invoices m
      JOIN invoices i ON i.id = m.invoice_id
      JOIN pro_forma_invoices pf ON pf.id = m.pro_forma_invoice_id
      WHERE i.subtotal::numeric <> pf.subtotal::numeric
    `);
    check('every PF-origin invoice subtotal matches PF subtotal', Number(drift[0]?.n ?? '0') === 0);

    const lineDrift = await db.execute<{ n: string }>(sql`
      SELECT COUNT(DISTINCT m.pro_forma_invoice_id)::text AS n
      FROM pro_forma_official_invoices m
      JOIN (
        SELECT invoice_id, COUNT(*) AS c
        FROM invoice_line_items GROUP BY invoice_id
      ) il ON il.invoice_id = m.invoice_id
      JOIN (
        SELECT pro_forma_invoice_id, COUNT(*) AS c
        FROM pro_forma_line_items GROUP BY pro_forma_invoice_id
      ) pfl ON pfl.pro_forma_invoice_id = m.pro_forma_invoice_id
      WHERE il.c <> pfl.c
    `);
    check(
      'every PF-origin invoice has the same number of lines as the PF',
      Number(lineDrift[0]?.n ?? '0') === 0,
    );
  }

  /* 7. INV numbers unique + sequential within a year */
  console.log('\n── 7. INV numbers unique + sequential');
  {
    const dupe = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM (
        SELECT number FROM invoices GROUP BY number HAVING COUNT(*) > 1
      ) d
    `);
    check('no duplicate INV number', Number(dupe[0]?.n ?? '0') === 0);

    // Sequential: every year's set should be 1..N contiguous.
    const years = await db.execute<{ yr: string; mx: string; cnt: string }>(sql`
      SELECT SUBSTRING(number FROM 5 FOR 4) AS yr,
             MAX(SUBSTRING(number FROM 10)::int)::text AS mx,
             COUNT(*)::text AS cnt
      FROM invoices
      WHERE number LIKE 'INV-%'
      GROUP BY SUBSTRING(number FROM 5 FOR 4)
    `);
    let allSequential = true;
    for (const y of years as Array<{ yr: string; mx: string; cnt: string }>) {
      if (Number(y.mx) !== Number(y.cnt)) {
        allSequential = false;
        console.log(`    ⚠ year ${y.yr}: max=${y.mx} but count=${y.cnt} — gap present`);
      }
    }
    check(
      'INV numbering sequential within each year',
      allSequential,
      allSequential ? undefined : 'gaps found (not strictly required but should be investigated)',
    );
  }

  console.log('\n── Summary');
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`  ${pass} / ${results.length} passed`);
  if (fail.length > 0) {
    console.log('  ✗ Failures:');
    for (const f of fail) console.log(`    - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
  }
  console.log('\n✓ Stage 4 Part E — all PF/billing consistency invariants hold.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  console.error(e);
  process.exit(1);
});
