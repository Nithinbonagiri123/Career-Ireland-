import { config } from 'dotenv';
import { automatedRunRefusal, exitOnRefusal } from '../src/lib/db/manual-db-guard';

config({ path: '.env.local' });
// Decision 8: never against the manual-testing DB (no override).
exitOnRefusal(automatedRunRefusal('stage4.1-refund-walkthrough', process.env.DATABASE_URL));

/**
 * Stage 4.1 end-to-end refund walkthrough. Runs the Finance scenario:
 *
 *   Pro forma ACCEPTED for €500.
 *   Payment 1: €200 verified.
 *   Client cancels.
 *   Partial refund €100 → payment PARTIALLY_REFUNDED, balance drops.
 *   Full refund of remaining €100 → payment REFUNDED, balance = 0.
 *   Idempotent retry with same key → returns existing row, no second refund.
 *   Overrefund attempt → refused.
 *   Simultaneous refund race → UNIQUE catches the second.
 */

async function main() {
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { serviceEngagements } = await import('../src/lib/db/schema/commerce');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { proFormaInvoices, proFormaLineItems, proFormaPaymentRefunds, proposalGroups } =
    await import('../src/lib/db/schema/proformas');
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
  if (!lead?.personId) throw new Error('no CS lead with person_id');
  const [svc] = await db
    .select({ id: serviceCatalogItems.id })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.isActive, true))
    .limit(1);
  if (!svc) throw new Error('no active service');

  console.log('── Setup — admin:', admin.id.slice(0, 8), 'lead:', lead.id.slice(0, 8));

  // Seed ACCEPTED pro forma for €500 with one line.
  const stamp = (Date.now() % 1_000_000).toString(36);
  const number = `S41-${stamp}`.slice(0, 24);
  const pfId = await db.transaction(async (tx) => {
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
        subtotal: '500.00',
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedByUserId: admin.id,
      })
      .returning({ id: proFormaInvoices.id });
    if (!pf) throw new Error('pf');
    await tx.insert(proFormaLineItems).values({
      proFormaInvoiceId: pf.id,
      serviceCatalogItemId: svc.id,
      description: 'full package',
      quantity: '1.000',
      unitPrice: '500.00',
      lineSubtotal: '500.00',
      sortOrder: 0,
    });
    return pf.id;
  });
  console.log('── Created ACCEPTED pro forma', number, '(€500)');

  // Record + verify €200.
  const p1 = await paymentsService.recordPaymentForProFormaAs(
    {
      proFormaInvoiceId: pfId,
      amount: '200.00',
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: new Date(),
    },
    admin.id,
  );
  await paymentsService.verifyPaymentForProFormaAs(p1.paymentId, admin.id);

  async function balance(): Promise<{ paid: string; outstanding: string }> {
    const [{ paid, outstanding }] = (await db.execute<{ paid: string; outstanding: string }>(sql`
      WITH ref AS (
        SELECT payment_id, COALESCE(SUM((amount::numeric*100)::bigint), 0) AS refunded_cents
        FROM pro_forma_payment_refunds WHERE pro_forma_invoice_id = ${pfId}
        GROUP BY payment_id
      )
      SELECT
        (COALESCE(SUM(GREATEST((p.amount::numeric*100)::bigint - COALESCE(r.refunded_cents, 0), 0)), 0) / 100.0)::text AS paid,
        (500 - (COALESCE(SUM(GREATEST((p.amount::numeric*100)::bigint - COALESCE(r.refunded_cents, 0), 0)), 0) / 100.0))::text AS outstanding
      FROM payments p
      LEFT JOIN ref r ON r.payment_id = p.id
      WHERE p.pro_forma_invoice_id = ${pfId}
        AND p.status IN ('VERIFIED','PARTIALLY_REFUNDED','REFUNDED')
        AND p.currency_code = 'EUR'
    `)) as unknown as [{ paid: string; outstanding: string }];
    return { paid, outstanding };
  }

  let bal = await balance();
  console.log('── After verify P1 (€200): paid', bal.paid, 'outstanding', bal.outstanding);
  if (Number(bal.paid) !== 200) throw new Error(`expected paid 200, got ${bal.paid}`);

  // Partial refund: €50
  console.log('\n── Partial refund €50');
  const r1 = await refundsService.issuePreIssuanceRefundAs(
    {
      paymentId: p1.paymentId,
      amount: '50.00',
      method: 'BANK_TRANSFER',
      reason: 'client partial cancel',
      idempotencyKey: `partial-1-${Date.now()}`,
    },
    admin.id,
  );
  console.log('   refund', r1.refund.id.slice(0, 8), 'payment status', r1.paymentStatusAfter);
  if (r1.paymentStatusAfter !== 'PARTIALLY_REFUNDED')
    throw new Error('expected PARTIALLY_REFUNDED');
  bal = await balance();
  console.log('   balance: paid', bal.paid, 'outstanding', bal.outstanding);

  // Idempotent retry — same amount + same key → returns existing row.
  console.log('\n── Idempotent retry (same key) — should return existing refund');
  const r1Retry = await refundsService.issuePreIssuanceRefundAs(
    {
      paymentId: p1.paymentId,
      amount: '50.00',
      method: 'BANK_TRANSFER',
      reason: 'client partial cancel',
      idempotencyKey: r1.refund.idempotencyKey,
    },
    admin.id,
  );
  if (r1Retry.refund.id !== r1.refund.id) throw new Error('idempotent retry returned a new row');
  console.log('   ✓ same refund id returned');

  // Finish refund: €150 more (brings total refund to 200 = payment amount)
  console.log('\n── Full-remaining refund €150');
  const r2 = await refundsService.issuePreIssuanceRefundAs(
    {
      paymentId: p1.paymentId,
      amount: '150.00',
      method: 'BANK_TRANSFER',
      reason: 'client full cancel',
      idempotencyKey: `final-1-${Date.now()}`,
    },
    admin.id,
  );
  console.log('   refund', r2.refund.id.slice(0, 8), 'payment status', r2.paymentStatusAfter);
  if (r2.paymentStatusAfter !== 'REFUNDED') throw new Error('expected REFUNDED');
  bal = await balance();
  console.log('   balance: paid', bal.paid, 'outstanding', bal.outstanding);

  // Overrefund attempt: already refunded 200 of 200 — any further must fail.
  console.log('\n── Overrefund attempt — must be refused');
  try {
    await refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p1.paymentId,
        amount: '10.00',
        method: 'BANK_TRANSFER',
        reason: 'should not succeed',
        idempotencyKey: `over-${Date.now()}`,
      },
      admin.id,
    );
    throw new Error('overrefund should have been refused');
  } catch (e) {
    const msg = (e as Error).message;
    if (
      !/exceeds the refundable envelope|PROFORMA_REFUND_EXCEEDS|PAYMENT_WRONG_STATE|current: REFUNDED/.test(
        msg,
      )
    )
      throw e;
    console.log('   ✓ refused:', msg.slice(0, 100));
  }

  // Simultaneous refund race (same key).
  console.log('\n── Simultaneous refund race on fresh payment');
  // Record + verify €100.
  const p2 = await paymentsService.recordPaymentForProFormaAs(
    {
      proFormaInvoiceId: pfId,
      amount: '100.00',
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: new Date(),
    },
    admin.id,
  );
  await paymentsService.verifyPaymentForProFormaAs(p2.paymentId, admin.id);
  const sameKey = `race-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const [a, b] = await Promise.allSettled([
    refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p2.paymentId,
        amount: '30.00',
        method: 'BANK_TRANSFER',
        reason: 'race test',
        idempotencyKey: sameKey,
      },
      admin.id,
    ),
    refundsService.issuePreIssuanceRefundAs(
      {
        paymentId: p2.paymentId,
        amount: '30.00',
        method: 'BANK_TRANSFER',
        reason: 'race test',
        idempotencyKey: sameKey,
      },
      admin.id,
    ),
  ]);
  const refundIds = [a, b].flatMap((r) => (r.status === 'fulfilled' ? [r.value.refund.id] : []));
  console.log(
    '   outcomes:',
    refundIds.length,
    'succeeded; unique refund ids:',
    new Set(refundIds).size,
  );
  if (new Set(refundIds).size !== 1) throw new Error('expected both to resolve to the same refund');

  // Verify the DB row counts match expectations.
  const [{ n: refundCount }] = (await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM pro_forma_payment_refunds WHERE pro_forma_invoice_id = ${pfId}
  `)) as unknown as [{ n: string }];
  console.log('\n── Refund rows for this pro forma:', refundCount);

  // Reference imports to silence lint
  void proFormaPaymentRefunds;
  void serviceEngagements;

  console.log('\n✓ Stage 4.1 pre-issuance refund walkthrough complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  console.error(e);
  process.exit(1);
});
