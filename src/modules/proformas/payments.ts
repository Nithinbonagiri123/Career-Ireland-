import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { proFormaInvoices, proFormaOfficialInvoices } from '@/lib/db/schema/proformas';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { insertReceipt, recomputeInvoiceStatus } from '@/modules/billing/service';
import { activateCandidateInTx } from '@/modules/clients/activation-service';
import { issueOfficialInvoiceForProForma } from './issuance';
import { centsToMoney, moneyToCents } from './money';

/**
 * Pro-forma payment orchestration — Stage 3.
 *
 * ── Payment path ─────────────────────────────────────────────────────
 *   1. recordPaymentForProForma(input)     — DRAFT payment attached to
 *      the pro forma. Creates / reuses the service_engagement that
 *      anchors the money chain. Payment lands as status=PENDING.
 *   2. verifyPaymentForProForma(input)     — Finance confirms the bank
 *      line. Checks (a) currency equals the pro forma currency and
 *      (b) verifying this payment wouldn't exceed the pro forma total
 *      (overpayment guard). On success writes a receipt and, if the
 *      verified sum equals the pro forma total within 1 cent tolerance,
 *      issues the official invoice via `issueOfficialInvoiceForProForma`
 *      and flips the pro forma to CONVERTED — all atomic.
 *
 * ── Invariants enforced ──────────────────────────────────────────────
 *   - Only ACCEPTED or CONVERTED pro formas can accept payments.
 *   - Currency on the payment MUST equal the pro-forma currency; cross-
 *     currency allocation is blocked with a clear error (FX workflow
 *     deferred — see docs/stage3-payment-allocation.md §6).
 *   - Verifying any payment that would push the verified sum over the
 *     pro forma total refuses with PROFORMA_PAYMENT_OVERALLOCATION.
 *   - The issuance call is idempotent; the pro_forma_official_invoices
 *     triple UNIQUE is the DB-level backstop against duplicate invoices.
 *   - Receipt insert is unique per payment_id — no path can produce two
 *     receipts for the same payment.
 */

/* ─────────────────────────────────────────────────────────────────── */
/* Balance / reconciliation                                            */
/* ─────────────────────────────────────────────────────────────────── */

export type ProFormaBalance = {
  proFormaInvoiceId: string;
  currencyCode: string;
  total: string;
  verifiedPaid: string;
  outstanding: string;
  /** >0 when verified payments exceed total — should never happen
   *  because the verify writer blocks it, but surfaced here as a
   *  tripwire for the UI. */
  overpaidExcess: string;
  payments: Array<{
    id: string;
    amount: string;
    currencyCode: string;
    status: string;
    method: string;
    receivedAt: Date | null;
    verifiedAt: Date | null;
    proofReference: string | null;
  }>;
};

export async function fetchProFormaBalance(proFormaInvoiceId: string): Promise<ProFormaBalance> {
  await requirePermission('candidate_services', 'proformas', 'view');
  const [pf] = await db
    .select({
      currencyCode: proFormaInvoices.currencyCode,
      subtotal: proFormaInvoices.subtotal,
    })
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.id, proFormaInvoiceId))
    .limit(1);
  if (!pf) throw new NotFoundError('Pro forma');

  const paymentRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      currencyCode: payments.currencyCode,
      status: payments.status,
      method: payments.method,
      receivedAt: payments.receivedAt,
      verifiedAt: payments.verifiedAt,
      proofReference: payments.proofReference,
    })
    .from(payments)
    .where(eq(payments.proFormaInvoiceId, proFormaInvoiceId))
    .orderBy(payments.createdAt);

  // Pre-issuance refunds reduce the verified contribution. Fetch the
  // per-payment refund sums for this pro forma in one query.
  const refundSumRows = await db.execute<{ payment_id: string; sum_cents: string }>(sql`
    SELECT payment_id, COALESCE(SUM((amount::numeric * 100)::bigint), 0)::text AS sum_cents
    FROM pro_forma_payment_refunds
    WHERE pro_forma_invoice_id = ${proFormaInvoiceId}
    GROUP BY payment_id
  `);
  const refundByPayment = new Map<string, number>();
  for (const r of refundSumRows) {
    refundByPayment.set(r.payment_id, Number(r.sum_cents));
  }

  const totalCents = moneyToCents(pf.subtotal);
  let verifiedCents = 0;
  for (const p of paymentRows) {
    // Count VERIFIED, PARTIALLY_REFUNDED and REFUNDED payments toward
    // the gross; refunds against those payments then offset. Only
    // same-currency payments contribute (cross-currency is Stage N+1).
    const isCountable =
      (p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'REFUNDED') &&
      p.currencyCode === pf.currencyCode;
    if (!isCountable) continue;
    const grossCents = moneyToCents(p.amount);
    const refundedCents = refundByPayment.get(p.id) ?? 0;
    verifiedCents += Math.max(grossCents - refundedCents, 0);
  }
  const outstandingCents = Math.max(totalCents - verifiedCents, 0);
  const overpaidCents = Math.max(verifiedCents - totalCents, 0);

  return {
    proFormaInvoiceId,
    currencyCode: pf.currencyCode,
    total: centsToMoney(totalCents),
    verifiedPaid: centsToMoney(verifiedCents),
    outstanding: centsToMoney(outstandingCents),
    overpaidExcess: centsToMoney(overpaidCents),
    payments: paymentRows,
  };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Record a payment against a pro forma                                */
/* ─────────────────────────────────────────────────────────────────── */

export type RecordPaymentInput = {
  proFormaInvoiceId: string;
  amount: string;
  currencyCode: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  receivedAt?: Date | null;
  proofReference?: string | null;
};

export async function recordPaymentForProForma(
  input: RecordPaymentInput,
): Promise<{ paymentId: string; engagementId: string }> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');
  return recordPaymentForProFormaAs(input, session.user.id);
}

/** Session-less variant for testing / background jobs. Caller is
 *  responsible for authorisation. */
export async function recordPaymentForProFormaAs(
  input: RecordPaymentInput,
  actorUserId: string,
): Promise<{ paymentId: string; engagementId: string }> {
  return db.transaction(async (tx) => {
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, input.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    if (pf.status !== 'ACCEPTED' && pf.status !== 'CONVERTED') {
      throw new BusinessRuleError(
        'PROFORMA_NOT_ACCEPTED',
        `Pro formas accept payments only once ACCEPTED (current: ${pf.status})`,
      );
    }
    if (input.currencyCode !== pf.currencyCode) {
      // Stage 3 blocks cross-currency allocation. See
      // docs/stage3-payment-allocation.md §6 for the FX workflow design.
      throw new BusinessRuleError(
        'PROFORMA_CURRENCY_MISMATCH',
        `Payment currency (${input.currencyCode}) does not match the pro forma currency (${pf.currencyCode}). Cross-currency allocation is blocked in Stage 3.`,
      );
    }
    const amountCents = moneyToCents(input.amount);
    if (amountCents <= 0) {
      throw new ValidationError('Payment amount must be positive');
    }

    // Reuse the pro forma's engagement if an earlier payment created one.
    // Otherwise create a fresh engagement anchored at the pro forma total.
    const [existingPayment] = await tx
      .select({ engagementId: payments.serviceEngagementId })
      .from(payments)
      .where(eq(payments.proFormaInvoiceId, pf.id))
      .limit(1);

    let engagementId: string;
    if (existingPayment) {
      engagementId = existingPayment.engagementId;
    } else {
      // Pick the first line's service as the engagement's primary service.
      // The invoice we eventually issue will carry all pro-forma lines; the
      // engagement is just the bookkeeping anchor the ledger needs.
      // `tx.execute` returns raw postgres rows with snake_case columns —
      // use the schema object to get camelCase instead.
      const { proFormaLineItems } = await import('@/lib/db/schema/proformas');
      const [firstLine] = await tx
        .select({ serviceCatalogItemId: proFormaLineItems.serviceCatalogItemId })
        .from(proFormaLineItems)
        .where(eq(proFormaLineItems.proFormaInvoiceId, pf.id))
        .orderBy(proFormaLineItems.sortOrder)
        .limit(1);
      if (!firstLine) {
        throw new BusinessRuleError(
          'PROFORMA_HAS_NO_LINES',
          'Cannot record a payment against a pro forma that has no line items',
        );
      }
      const [eng] = await tx
        .insert(serviceEngagements)
        .values({
          serviceCatalogItemId: firstLine.serviceCatalogItemId,
          payerPersonId: pf.payerPersonId,
          beneficiaryPersonId: pf.payerPersonId,
          agreedAmount: pf.subtotal,
          currencyCode: pf.currencyCode,
          status: 'PENDING_PAYMENT',
          notes: `Auto-created at first payment for ${pf.number}`,
        })
        .returning({ id: serviceEngagements.id });
      if (!eng) throw new Error('service_engagements insert returned no row');
      engagementId = eng.id;
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        serviceEngagementId: engagementId,
        proFormaInvoiceId: pf.id,
        amount: input.amount,
        currencyCode: input.currencyCode,
        method: input.method,
        status: 'PENDING',
        receivedAt: input.receivedAt ?? null,
        proofReference: input.proofReference ?? null,
      })
      .returning({ id: payments.id });
    if (!payment) throw new Error('payments insert returned no row');

    await recordAudit(tx, {
      actorUserId: actorUserId,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'PAYMENT_RECORDED',
      after: {
        paymentId: payment.id,
        amount: input.amount,
        currencyCode: input.currencyCode,
        method: input.method,
      },
    });

    return { paymentId: payment.id, engagementId };
  });
}

/* ─────────────────────────────────────────────────────────────────── */
/* Verify a payment                                                    */
/* ─────────────────────────────────────────────────────────────────── */

export type VerifyPaymentResult = {
  paymentId: string;
  receiptId: string;
  issuedInvoiceId: string | null;
  issuedInvoiceNumber: string | null;
  /**
   * Stage 6F — when the verification completes the full agreed amount
   * on a CS pro forma, the candidate is activated atomically in the
   * same transaction. These two fields describe the candidate side so
   * the UI can show one coherent success state ("invoice INV-… issued
   * + candidate active, open workspace →") instead of a second
   * "Activate candidate" prompt. `null` when the payment is a partial
   * (pro forma not yet fully paid), when the lead was already
   * CONVERTED, or for the rare non-CS pro-forma pathway.
   */
  candidateProfileId: string | null;
  candidatePersonId: string | null;
};

export async function verifyPaymentForProForma(paymentId: string): Promise<VerifyPaymentResult> {
  const session = await requirePermission('candidate_services', 'proformas', 'edit');
  return verifyPaymentForProFormaAs(paymentId, session.user.id);
}

/** Session-less variant for testing / background jobs. Caller is
 *  responsible for authorisation. */
export async function verifyPaymentForProFormaAs(
  paymentId: string,
  actorUserId: string,
): Promise<VerifyPaymentResult> {
  return db.transaction(async (tx) => {
    // Lock the payment row.
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .for('update')
      .limit(1);
    if (!payment) throw new NotFoundError('Payment');
    if (!payment.proFormaInvoiceId) {
      throw new BusinessRuleError(
        'PAYMENT_NOT_PROFORMA',
        'This payment is not attached to a pro forma. Use the invoice-based payment verifier.',
      );
    }
    if (payment.status === 'VERIFIED') {
      // Idempotent: already verified. Return the existing receipt + any
      // issued invoice + any candidate activation without re-processing.
      const [existingReceipt] = await tx.execute<{ id: string }>(
        sql`SELECT id FROM receipts WHERE payment_id = ${payment.id} LIMIT 1`,
      );
      const [issued] = await tx
        .select({
          id: invoices.id,
          number: invoices.number,
          sourceLeadId: proFormaInvoices.sourceLeadId,
        })
        .from(proFormaOfficialInvoices)
        .innerJoin(invoices, eq(invoices.id, proFormaOfficialInvoices.invoiceId))
        .innerJoin(
          proFormaInvoices,
          eq(proFormaInvoices.id, proFormaOfficialInvoices.proFormaInvoiceId),
        )
        .where(eq(proFormaOfficialInvoices.proFormaInvoiceId, payment.proFormaInvoiceId))
        .limit(1);
      // Stage 6F — if an invoice was already issued but the lead
      // hasn't been activated yet (payment verified before the Stage
      // 6F wiring landed), activate idempotently on this replay.
      let candidateProfileId: string | null = null;
      let candidatePersonId: string | null = null;
      if (issued) {
        const activation = await activateCandidateInTx(tx, {
          leadId: issued.sourceLeadId,
          actorUserId,
          via: 'proforma_payment_verified',
          note: 'Idempotent replay — activating candidate for a previously-issued invoice.',
        });
        candidateProfileId = activation.candidateProfileId;
        candidatePersonId = activation.personId;
      }
      return {
        paymentId: payment.id,
        receiptId: existingReceipt?.id ?? '',
        issuedInvoiceId: issued?.id ?? null,
        issuedInvoiceNumber: issued?.number ?? null,
        candidateProfileId,
        candidatePersonId,
      };
    }
    if (payment.status === 'REJECTED' || payment.status === 'REFUNDED') {
      throw new BusinessRuleError(
        'PAYMENT_WRONG_STATE',
        `Cannot verify a payment in status ${payment.status}`,
      );
    }

    // Lock the pro forma row so a concurrent verify path can't double-
    // issue the invoice.
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, payment.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    if (pf.status !== 'ACCEPTED' && pf.status !== 'CONVERTED') {
      throw new BusinessRuleError(
        'PROFORMA_NOT_ACCEPTED',
        `Verification requires an ACCEPTED or CONVERTED pro forma (current: ${pf.status})`,
      );
    }
    if (payment.currencyCode !== pf.currencyCode) {
      throw new BusinessRuleError(
        'PROFORMA_CURRENCY_MISMATCH',
        `Payment currency (${payment.currencyCode}) does not match the pro forma currency (${pf.currencyCode})`,
      );
    }

    // Overpayment guard. Compute net verified sum (VERIFIED +
    // PARTIALLY_REFUNDED + REFUNDED gross, minus pre-issuance refunds
    // against those payments) + this payment's amount. If the result
    // exceeds pf.subtotal by more than a 1-cent rounding tolerance,
    // refuse. Operator must refund excess or route via exception
    // before verifying.
    const alreadyVerified = await tx.execute<{ sum_cents: string }>(sql`
      SELECT COALESCE(SUM(net_cents), 0)::text AS sum_cents
      FROM (
        SELECT (p.amount::numeric * 100)::bigint - COALESCE((
          SELECT SUM((rfd.amount::numeric * 100)::bigint)
          FROM pro_forma_payment_refunds rfd
          WHERE rfd.payment_id = p.id
        ), 0) AS net_cents
        FROM payments p
        WHERE p.pro_forma_invoice_id = ${pf.id}
          AND p.status IN ('VERIFIED','PARTIALLY_REFUNDED','REFUNDED')
          AND p.currency_code = ${pf.currencyCode}
      ) t
    `);
    const alreadyCents = Number(alreadyVerified[0]?.sum_cents ?? '0');
    const thisCents = moneyToCents(payment.amount);
    const totalAfterCents = alreadyCents + thisCents;
    const pfTotalCents = moneyToCents(pf.subtotal);
    const OVERPAY_TOLERANCE = 1;
    if (totalAfterCents > pfTotalCents + OVERPAY_TOLERANCE) {
      const excessCents = totalAfterCents - pfTotalCents;
      throw new BusinessRuleError(
        'PROFORMA_PAYMENT_OVERALLOCATION',
        `Verifying this payment would exceed the accepted pro forma total by ${centsToMoney(excessCents)} ${pf.currencyCode}. Resolve the excess (refund or exception) before verifying.`,
      );
    }

    const now = new Date();
    const [verified] = await tx
      .update(payments)
      .set({
        status: 'VERIFIED',
        verifiedAt: now,
        verifiedByUserId: actorUserId,
        receivedAt: payment.receivedAt ?? now,
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, 'PENDING')))
      .returning({ id: payments.id });

    // If the status moved out from under us (another path verified first)
    // bail cleanly — the earlier branch handles the idempotent return.
    if (!verified) {
      throw new BusinessRuleError('PAYMENT_RACED', 'Payment state changed concurrently');
    }

    // Issue the receipt (one per payment, enforced by UNIQUE(payment_id)).
    const receipt = await insertReceipt(tx, {
      paymentId: payment.id,
      invoiceId: null, // backfilled below if we issue an invoice
      payerPersonId: pf.payerPersonId,
      amount: payment.amount,
      currencyCode: pf.currencyCode,
      receivedAt: payment.receivedAt ?? now,
      issuedByUserId: actorUserId,
    });

    await recordAudit(tx, {
      actorUserId: actorUserId,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'PAYMENT_VERIFIED',
      after: {
        paymentId: payment.id,
        receiptId: receipt.id,
        receiptNumber: receipt.number,
        verifiedSumCents: totalAfterCents,
        pfTotalCents,
      },
    });

    // Full-payment check. If verified sum (including this payment) now
    // meets the pro forma total (within tolerance), issue the official
    // invoice. The issuance is idempotent — if a concurrent verify beat
    // us to it, we get back the existing invoice.
    let issuedInvoiceId: string | null = null;
    let issuedInvoiceNumber: string | null = null;
    let candidateProfileId: string | null = null;
    let candidatePersonId: string | null = null;
    if (totalAfterCents + OVERPAY_TOLERANCE >= pfTotalCents) {
      const issued = await issueOfficialInvoiceForProForma(tx, {
        proFormaInvoiceId: pf.id,
        purpose: 'FULL_PAYMENT',
        issuanceKey: 'full',
        issuedByUserId: actorUserId,
      });
      issuedInvoiceId = issued.id;
      issuedInvoiceNumber = issued.number;

      // Backfill the receipt we just wrote (and any earlier receipts on
      // this pro forma that had no invoice to point at) with the new
      // invoice id. Idempotent — later verifies on the same pro forma
      // will no-op through issueOfficialInvoiceForProForma above and
      // this UPDATE affects only rows whose invoice_id IS NULL.
      await tx.execute(sql`
        UPDATE receipts
        SET invoice_id = ${issued.id},
            updated_at = NOW()
        WHERE payment_id IN (
          SELECT id FROM payments WHERE pro_forma_invoice_id = ${pf.id}
        )
          AND invoice_id IS NULL
      `);

      // Stage 6B+3 — atomic status flip. The invoice was inserted as
      // ISSUED by `issueOfficialInvoiceForProForma`; now that the
      // verified-payment total matches it, recompute to flip ISSUED →
      // PAID (or PARTIALLY_PAID in the rare case the payment under-
      // allocates by more than the tolerance). Runs inside the same
      // transaction as the invoice insert + receipt backfill so no
      // intermediate state is observable, and takes `SELECT ... FOR
      // UPDATE` on the invoice row via recomputeInvoiceStatus so a
      // concurrent credit-note write serialises behind us.
      await recomputeInvoiceStatus(tx, issued.id);

      await recordAudit(tx, {
        actorUserId: actorUserId,
        entityType: 'pro_forma_invoice',
        entityId: pf.id,
        action: 'CONVERTED',
        before: { status: pf.status },
        after: { status: 'CONVERTED', invoiceId: issued.id, invoiceNumber: issued.number },
      });

      // Stage 6F — atomic candidate activation. Now that the invoice +
      // receipt are issued, flip the originating lead to CONVERTED and
      // create (or reuse) the candidate profile in the SAME transaction.
      // Operators no longer have to click "Activate candidate" as a
      // second step. CS-only — the activation primitive refuses non-CS
      // leads, so a stray Immigration pro forma won't accidentally
      // create a candidate profile. Idempotent: if the person already
      // has a profile (second paid pro forma on the same client), the
      // existing profile is reused.
      const activation = await activateCandidateInTx(tx, {
        leadId: pf.sourceLeadId,
        actorUserId,
        via: 'proforma_payment_verified',
      });
      candidateProfileId = activation.candidateProfileId;
      candidatePersonId = activation.personId;
    }

    return {
      paymentId: payment.id,
      receiptId: receipt.id,
      issuedInvoiceId,
      issuedInvoiceNumber,
      candidateProfileId,
      candidatePersonId,
    };
  });
}
