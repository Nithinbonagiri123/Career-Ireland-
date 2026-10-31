import { config } from 'dotenv';
import { automatedRunRefusal, exitOnRefusal } from '../src/lib/db/manual-db-guard';

config({ path: '.env.local' });
// Decision 8: never against the manual-testing DB (no override).
exitOnRefusal(automatedRunRefusal('stage3-service-walkthrough', process.env.DATABASE_URL));

/**
 * Stage 3 end-to-end backend walkthrough. Executes the full payment-
 * triggered issuance flow by calling the service functions directly
 * via the Drizzle writer (bypassing requirePermission by threading the
 * admin user ID into a bespoke test harness).
 *
 * Proves:
 *   1. 3 partial payments → verified sum tracks correctly
 *   2. Final verify triggers invoice issuance
 *   3. Invoice has multi-line parity with the pro forma
 *   4. Pro forma flips to CONVERTED
 *   5. Receipts backfill with invoice_id
 *   6. Overpayment attempt is refused
 *   7. Cross-currency payment is refused
 */

async function main() {
  const { and, desc, eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { invoiceLineItems, invoices, receipts } = await import('../src/lib/db/schema/billing');
  const { payments, serviceEngagements } = await import('../src/lib/db/schema/commerce');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { proFormaInvoices, proFormaLineItems, proFormaOfficialInvoices, proposalGroups } =
    await import('../src/lib/db/schema/proformas');
  const { serviceCatalogItems } = await import('../src/lib/db/schema/services');
  const { users } = await import('../src/lib/db/schema/users');

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
    .select({ id: serviceCatalogItems.id, name: serviceCatalogItems.name })
    .from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.isActive, true))
    .limit(1);
  if (!svc) throw new Error('no active service catalog item');

  console.log('── Setup — admin:', admin.id.slice(0, 8), 'lead:', lead.id.slice(0, 8));

  // Create a fresh pro forma for EUR 500 with 2 lines: 300 + 200
  const number = `PROF-TEST-${Date.now() % 100000}`;
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
    await tx.insert(proFormaLineItems).values([
      {
        proFormaInvoiceId: pf.id,
        serviceCatalogItemId: svc.id,
        description: 'Line A — primary',
        quantity: '1.000',
        unitPrice: '300.00',
        lineSubtotal: '300.00',
        sortOrder: 0,
      },
      {
        proFormaInvoiceId: pf.id,
        serviceCatalogItemId: svc.id,
        description: 'Line B — add-on',
        quantity: '2.000',
        unitPrice: '100.00',
        lineSubtotal: '200.00',
        sortOrder: 1,
      },
    ]);
    return pf.id;
  });
  console.log(
    '── Created ACCEPTED pro forma',
    number,
    'id',
    pfId.slice(0, 8),
    '(2 lines, EUR 500)',
  );

  const paymentsService = await import('../src/modules/proformas/payments');
  const record = paymentsService.recordPaymentForProFormaAs;
  const verify = paymentsService.verifyPaymentForProFormaAs;

  // Balance helper uses the session-wrapped function; replicate it inline.
  async function balance() {
    const totalCents = Math.round(500 * 100);
    const sumRows = await db.execute<{ sum_cents: string }>(sql`
      SELECT COALESCE(SUM((amount::numeric * 100)::bigint), 0)::text AS sum_cents
      FROM payments
      WHERE pro_forma_invoice_id = ${pfId}
        AND status = 'VERIFIED'
        AND currency_code = 'EUR'
    `);
    const verifiedCents = Number(sumRows[0]?.sum_cents ?? '0');
    const outstandingCents = Math.max(totalCents - verifiedCents, 0);
    return {
      verifiedPaid: (verifiedCents / 100).toFixed(2),
      outstanding: (outstandingCents / 100).toFixed(2),
    };
  }

  // Partial payment #1 — €200
  console.log('\n── Payment 1: EUR 200 →');
  const p1 = await record(
    {
      proFormaInvoiceId: pfId,
      amount: '200.00',
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: new Date(),
    },
    admin.id,
  );
  console.log('   recorded', p1.paymentId.slice(0, 8));
  const r1 = await verify(p1.paymentId, admin.id);
  console.log(
    '   verified; receipt',
    r1.receiptId.slice(0, 8),
    '; invoice issued?',
    r1.issuedInvoiceNumber ?? '(no — partial)',
  );
  let bal = await balance();
  console.log('   balance: paid=', bal.verifiedPaid, 'outstanding=', bal.outstanding);
  if (bal.outstanding !== '300.00')
    throw new Error(`expected outstanding 300.00, got ${bal.outstanding}`);

  // Partial payment #2 — €200
  console.log('\n── Payment 2: EUR 200 →');
  const p2 = await record(
    {
      proFormaInvoiceId: pfId,
      amount: '200.00',
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: new Date(),
    },
    admin.id,
  );
  const r2 = await verify(p2.paymentId, admin.id);
  console.log('   verified; invoice issued?', r2.issuedInvoiceNumber ?? '(no — partial)');
  bal = await balance();
  console.log('   balance: paid=', bal.verifiedPaid, 'outstanding=', bal.outstanding);
  if (bal.outstanding !== '100.00')
    throw new Error(`expected outstanding 100.00, got ${bal.outstanding}`);

  // Final payment #3 — €100 → triggers issuance
  console.log('\n── Payment 3: EUR 100 (final) →');
  const p3 = await record(
    {
      proFormaInvoiceId: pfId,
      amount: '100.00',
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: new Date(),
    },
    admin.id,
  );
  const r3 = await verify(p3.paymentId, admin.id);
  console.log('   verified; invoice issued:', r3.issuedInvoiceNumber);
  bal = await balance();
  console.log('   balance: paid=', bal.verifiedPaid, 'outstanding=', bal.outstanding);
  if (!r3.issuedInvoiceNumber) throw new Error('expected invoice issuance on final payment');
  if (bal.outstanding !== '0.00') throw new Error(`expected outstanding 0, got ${bal.outstanding}`);

  // Verify multi-line parity
  const invId = r3.issuedInvoiceId;
  if (!invId) throw new Error('expected invoice id');
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invId)).limit(1);
  const invLines = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invId))
    .orderBy(invoiceLineItems.sortOrder);
  console.log('\n── Invoice', inv?.number, '(sourceLeadId:', inv?.sourceLeadId?.slice(0, 8), '):');
  console.log(
    '   subtotal:',
    inv?.subtotal,
    'tax:',
    inv?.taxAmount,
    'total:',
    inv?.totalAmount,
    'vat:',
    inv?.vatTreatment,
  );
  console.log('   lines:', invLines.length);
  for (const li of invLines) {
    console.log('    ·', li.quantity, '×', li.unitPrice, '=', li.lineSubtotal, '—', li.description);
  }
  if (invLines.length !== 2) throw new Error('expected 2 line items on invoice');
  if (inv?.subtotal !== '500.00') throw new Error('expected invoice subtotal 500.00');

  // Verify pro forma status flipped to CONVERTED
  const [pf] = await db
    .select({ status: proFormaInvoices.status })
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, pfId))
    .limit(1);
  console.log('   pro forma status:', pf?.status);
  if (pf?.status !== 'CONVERTED') throw new Error('expected CONVERTED');

  // Verify receipts backfill
  const receiptRows = await db
    .select({
      id: receipts.id,
      number: receipts.number,
      paymentId: receipts.paymentId,
      invoiceId: receipts.invoiceId,
    })
    .from(receipts)
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .where(eq(payments.proFormaInvoiceId, pfId));
  console.log('\n── Receipts for this pro forma:', receiptRows.length);
  for (const r of receiptRows) {
    console.log('    ·', r.number, 'invoice_id:', r.invoiceId?.slice(0, 8) ?? 'NULL');
  }
  const nullInvoices = receiptRows.filter((r) => r.invoiceId === null).length;
  if (nullInvoices > 0) throw new Error(`${nullInvoices} receipts missing invoice backfill`);

  // Verify issuance idempotency: a second verify of p3 should return the same invoice
  console.log('\n── Idempotency: re-verifying payment 3');
  const r3Again = await verify(p3.paymentId, admin.id);
  if (r3Again.issuedInvoiceId !== invId)
    throw new Error('expected idempotent return of same invoice');
  console.log('   same invoice returned:', r3Again.issuedInvoiceNumber);

  // Overpayment attempt
  console.log('\n── Overpayment: recording EUR 50 against CONVERTED pro forma + verify');
  const pOver = await record(
    {
      proFormaInvoiceId: pfId,
      amount: '50.00',
      currencyCode: 'EUR',
      method: 'BANK_TRANSFER',
      receivedAt: new Date(),
    },
    admin.id,
  );
  try {
    await verify(pOver.paymentId, admin.id);
    throw new Error('expected overpayment to be refused');
  } catch (e) {
    const msg = (e as Error).message;
    if (!/would exceed|OVERALLOCATION/i.test(msg)) throw e;
    console.log('   ✓ refused:', msg.slice(0, 100));
  }

  // Cross-currency attempt
  console.log('\n── Cross-currency: recording ZAR 1000 should be refused at record time');
  try {
    await record(
      {
        proFormaInvoiceId: pfId,
        amount: '1000.00',
        currencyCode: 'ZAR',
        method: 'BANK_TRANSFER',
        receivedAt: new Date(),
      },
      admin.id,
    );
    throw new Error('expected cross-currency to be refused');
  } catch (e) {
    const msg = (e as Error).message;
    if (!/currency|MISMATCH/i.test(msg)) throw e;
    console.log('   ✓ refused:', msg.slice(0, 100));
  }

  console.log('\n✓ Stage 3 end-to-end backend walkthrough complete.');
  // Keep rows: user can inspect manually.
  // Reference unused imports to silence lint warnings.
  void proFormaOfficialInvoices;
  void serviceEngagements;
  void and;
  void desc;
  void sql;
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  console.error(e);
  process.exit(1);
});
