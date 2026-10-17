import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * Stage 4.2 — independent refund invariants audit.
 *
 * This audit is deliberately separate from stage4.1-refund-walkthrough:
 * that script proved the happy path. This one proves the two FINANCIAL
 * invariants that matter for shipping:
 *
 *   I1. Refunds reduce net paid balance by exactly the refund amount.
 *   I2. A refund cannot be issued twice via (a) idempotency-key retry
 *       OR (b) concurrent simultaneous requests.
 *
 * All asserts are independent of the fetchProFormaBalance helper —
 * balance is recomputed inline from the raw tables so a bug in the
 * helper cannot hide a bug in the data.
 */

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  results.push({ name, ok: cond, detail });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { proFormaInvoices, proFormaLineItems, proposalGroups } = await import(
    '../src/lib/db/schema/proformas'
  );
  const { serviceCatalogItems } = await import('../src/lib/db/schema/services');
  const { users } = await import('../src/lib/db/schema/users');
  const paymentsService = await import('../src/modules/proformas/payments');
  const refundsService = await import('../src/modules/proformas/refunds');

  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e-admin not found');
  const [lead] = await db
    .select({ id: leads.id, personId: leads.personId })
    .from(leads)
    .where(eq(leads.targetBusiness, 'CANDIDATE_SERVICES'))
    .limit(1);
  if (!lead?.personId) throw new Error('no CS lead');
  const [svc] = await db
    .select({ id: serviceCatalogItems.id })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.isActive, true))
    .limit(1);
  if (!svc) throw new Error('no service');

  async function seedAcceptedPf(total: string): Promise<string> {
    const stamp = (Date.now() % 1_000_000).toString(36);
    const rand = Math.random().toString(36).slice(2, 5);
    const number = `S42-${stamp}-${rand}`.slice(0, 24);
    return db.transaction(async (tx) => {
      const [group] = await tx
        .insert(proposalGroups)
        .values({ leadId: lead.id })
        .returning({ id: proposalGroups.id });
      if (!group) throw new Error('group');
      const [pf] = await tx
        .insert(proFormaInvoices)
        .values({
          number,
          proposalGroupId: group.id,
          sourceLeadId: lead.id,
          payerPersonId: lead.personId as string,
          currencyCode: 'EUR',
          subtotal: total,
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: admin.id,
        })
        .returning({ id: proFormaInvoices.id });
      if (!pf) throw new Error('pf');
      await tx.insert(proFormaLineItems).values({
        proFormaInvoiceId: pf.id,
        serviceCatalogItemId: svc.id,
        description: 'x',
        quantity: '1.000',
        unitPrice: total,
        lineSubtotal: total,
        sortOrder: 0,
      });
      return pf.id;
    });
  }

  async function netPaidCents(pfId: string): Promise<number> {
    const [row] = (await db.execute<{ cents: string }>(sql`
      SELECT COALESCE(SUM(net_cents), 0)::text AS cents
      FROM (
        SELECT GREATEST(
          (p.amount::numeric * 100)::bigint
          - COALESCE((
            SELECT SUM((rfd.amount::numeric * 100)::bigint)
            FROM pro_forma_payment_refunds rfd WHERE rfd.payment_id = p.id
          ), 0),
          0
        ) AS net_cents
        FROM payments p
        WHERE p.pro_forma_invoice_id = ${pfId}
          AND p.status IN ('VERIFIED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND p.currency_code = 'EUR'
      ) t
    `)) as unknown as [{ cents: string }];
    return Number(row.cents);
  }

  /* ─────────────────────────────────────────────────────────────── */
  /* I1. Refunds reduce net paid balance correctly                   */
  /* ─────────────────────────────────────────────────────────────── */
  console.log('\n── I1. Refunds reduce net paid balance correctly');
  {
    const pfId = await seedAcceptedPf('300.00');
    const p = await paymentsService.recordPaymentForProFormaAs(
      {
        proFormaInvoiceId: pfId,
        amount: '300.00',
        currencyCode: 'EUR',
        method: 'BANK_TRANSFER',
        receivedAt: new Date(),
      },
      admin.id,
    );
    // Note: a full-amount payment would trigger issuance on verify.
    // Record a second smaller payment to keep the pro forma ACCEPTED.
    await paymentsService.verifyPaymentForProFormaAs(p.paymentId, admin.id);
    // After verify of €300 against €300 the pro forma CONVERTS (invoice
    // issued). For the I1 invariant we need a scenario where no invoice
    // exists yet — so set up a fresh PF with a partial payment instead.
    const pfId2 = await seedAcceptedPf('500.00');
    const p2 = await paymentsService.recordPaymentForProFormaAs(
      {
        proFormaInvoiceId: pfId2,
        amount: '300.00',
        currencyCode: 'EUR',
        method: 'BANK_TRANSFER',
        receivedAt: new Date(),
      },
      admin.id,
    );
    await paymentsService.verifyPaymentForProFormaAs(p2.paymentId, admin.id);

    const before = await netPaidCents(pfId2);
    check(`before refund: net paid = 30000 cents (300.00 EUR)`, before === 30000, String(before));

    // Partial refund €100 → net paid should drop to €200 (20000 cents)
    await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p2.paymentId,
        amount: '100.00',
        method: 'BANK_TRANSFER',
        reason: 'invariant I1 partial',
        idempotencyKey: `i1-partial-${Date.now()}`,
      },
      admin.id,
    );
    const afterPartial = await netPaidCents(pfId2);
    check(
      `after €100 partial refund: net paid = 20000 cents (200.00 EUR)`,
      afterPartial === 20000,
      String(afterPartial),
    );
    check(
      `refund delta equals exactly the refund amount`,
      before - afterPartial === 10000,
      String(before - afterPartial),
    );

    // Another €100 refund → net paid = €100
    await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p2.paymentId,
        amount: '100.00',
        method: 'BANK_TRANSFER',
        reason: 'invariant I1 chained partial',
        idempotencyKey: `i1-chained-${Date.now()}`,
      },
      admin.id,
    );
    const afterSecond = await netPaidCents(pfId2);
    check(
      `after chained second €100 refund: net paid = 10000 cents (100.00 EUR)`,
      afterSecond === 10000,
      String(afterSecond),
    );

    // Final €100 refund → net paid = 0, payment flips REFUNDED
    await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p2.paymentId,
        amount: '100.00',
        method: 'BANK_TRANSFER',
        reason: 'invariant I1 full',
        idempotencyKey: `i1-full-${Date.now()}`,
      },
      admin.id,
    );
    const afterFull = await netPaidCents(pfId2);
    check(`after €300 total refunded: net paid = 0`, afterFull === 0, String(afterFull));
    const [{ status: p2Status }] = (await db.execute<{ status: string }>(sql`
      SELECT status::text AS status FROM payments WHERE id = ${p2.paymentId}
    `)) as unknown as [{ status: string }];
    check(`payment flipped to REFUNDED`, p2Status === 'REFUNDED');
  }

  /* ─────────────────────────────────────────────────────────────── */
  /* I2a. Idempotency: same key → 1 refund row                       */
  /* ─────────────────────────────────────────────────────────────── */
  console.log('\n── I2a. Idempotency on retry with same key');
  {
    const pfId = await seedAcceptedPf('200.00');
    const p = await paymentsService.recordPaymentForProFormaAs(
      {
        proFormaInvoiceId: pfId,
        amount: '150.00',
        currencyCode: 'EUR',
        method: 'BANK_TRANSFER',
        receivedAt: new Date(),
      },
      admin.id,
    );
    await paymentsService.verifyPaymentForProFormaAs(p.paymentId, admin.id);

    const key = `i2a-retry-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const r1 = await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p.paymentId,
        amount: '40.00',
        method: 'BANK_TRANSFER',
        reason: 'I2a first',
        idempotencyKey: key,
      },
      admin.id,
    );
    // Three sequential retries.
    const r2 = await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p.paymentId,
        amount: '40.00',
        method: 'BANK_TRANSFER',
        reason: 'I2a retry 2',
        idempotencyKey: key,
      },
      admin.id,
    );
    const r3 = await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p.paymentId,
        amount: '40.00',
        method: 'BANK_TRANSFER',
        reason: 'I2a retry 3',
        idempotencyKey: key,
      },
      admin.id,
    );
    check(
      `all retries resolved to the same refund id`,
      r1.refund.id === r2.refund.id && r2.refund.id === r3.refund.id,
      r1.refund.id.slice(0, 8),
    );

    // Confirm exactly ONE row exists in the DB.
    const [{ n }] = (await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM pro_forma_payment_refunds
      WHERE payment_id = ${p.paymentId} AND idempotency_key = ${key}
    `)) as unknown as [{ n: string }];
    check(`exactly 1 DB row for the shared key`, Number(n) === 1, n);

    // Net paid dropped by exactly €40, not €120.
    const net = await netPaidCents(pfId);
    check(`net paid = €110 (150 − 40)`, net === 11000, String(net));
  }

  /* ─────────────────────────────────────────────────────────────── */
  /* I2b. Concurrency: two simultaneous requests → 1 refund row      */
  /* ─────────────────────────────────────────────────────────────── */
  console.log('\n── I2b. Concurrency on simultaneous requests');
  {
    const pfId = await seedAcceptedPf('200.00');
    const p = await paymentsService.recordPaymentForProFormaAs(
      {
        proFormaInvoiceId: pfId,
        amount: '120.00',
        currencyCode: 'EUR',
        method: 'BANK_TRANSFER',
        receivedAt: new Date(),
      },
      admin.id,
    );
    await paymentsService.verifyPaymentForProFormaAs(p.paymentId, admin.id);

    const key = `i2b-race-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const settled = await Promise.allSettled([
      refundsService.issuePreIssuanceRefundAs(
        {
          paymentId: p.paymentId,
          amount: '30.00',
          method: 'BANK_TRANSFER',
          reason: 'I2b race A',
          idempotencyKey: key,
        },
        admin.id,
      ),
      refundsService.issuePreIssuanceRefundAs(
        {
          paymentId: p.paymentId,
          amount: '30.00',
          method: 'BANK_TRANSFER',
          reason: 'I2b race B',
          idempotencyKey: key,
        },
        admin.id,
      ),
      refundsService.issuePreIssuanceRefundAs(
        {
          paymentId: p.paymentId,
          amount: '30.00',
          method: 'BANK_TRANSFER',
          reason: 'I2b race C',
          idempotencyKey: key,
        },
        admin.id,
      ),
    ]);
    const refundIds = new Set(
      settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value.refund.id] : [])),
    );
    check(
      `3 concurrent attempts collapsed to a single refund id`,
      refundIds.size === 1,
      String(refundIds.size),
    );

    // DB-level: exactly one row with that key.
    const [{ n }] = (await db.execute<{ n: string }>(sql`
      SELECT COUNT(*)::text AS n FROM pro_forma_payment_refunds
      WHERE payment_id = ${p.paymentId} AND idempotency_key = ${key}
    `)) as unknown as [{ n: string }];
    check(`exactly 1 DB row despite concurrent attempts`, Number(n) === 1, n);

    // Net paid dropped by exactly €30.
    const net = await netPaidCents(pfId);
    check(`net paid = €90 (120 − 30)`, net === 9000, String(net));
  }

  console.log('\n── Summary');
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`  ${pass} / ${results.length} passed`);
  if (fail.length > 0) {
    for (const f of fail) console.log(`    ✗ ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
  }
  console.log('\n✓ Stage 4.2 refund invariants audit — all pass.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  console.error(e);
  process.exit(1);
});
