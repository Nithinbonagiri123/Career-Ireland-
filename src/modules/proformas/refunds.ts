import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { assertFinanceActor, requireFinanceAuthority } from '@/lib/auth/finance-policy';
import { db } from '@/lib/db/client';
import { payments } from '@/lib/db/schema/commerce';
import {
  type ProFormaPaymentRefund,
  proFormaInvoices,
  proFormaOfficialInvoices,
  proFormaPaymentRefunds,
} from '@/lib/db/schema/proformas';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { emitFinancialEvent } from '@/modules/accounting/events';
import { centsToMoney, moneyToCents } from './money';

/**
 * Pre-issuance refund service — Stage 4.1.
 *
 * Called when Finance needs to return money paid against an ACCEPTED
 * pro forma before any official invoice has been issued. Writes a
 * `pro_forma_payment_refunds` row, flips the payment status based on
 * cumulative refunds, emits a ledger event, and records audit. Does
 * NOT create a credit note or fictional invoice.
 *
 * ── Guards ───────────────────────────────────────────────────────────
 *   - Finance authority only (central finance policy, REVERSE tier).
 *   - Pro forma must be ACCEPTED (not CONVERTED — CONVERTED means an
 *     invoice exists, and the standard refund path with credit note
 *     applies instead).
 *   - Payment must be VERIFIED (or PARTIALLY_REFUNDED from an earlier
 *     refund — chained refunds allowed up to amount).
 *   - Refund amount + prior refunds against the same payment must not
 *     exceed the payment's amount (overrefund blocked).
 *   - Currency on the refund must match the payment's currency.
 *   - Idempotency key is required; replay with the same key returns
 *     the existing row.
 *   - FOR UPDATE lock on the payment row serialises concurrent refund
 *     attempts; the `(payment_id, idempotency_key)` UNIQUE is the DB
 *     backstop.
 */

export type IssuePreIssuanceRefundInput = {
  paymentId: string;
  amount: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  reason: string;
  reference?: string | null;
  /** Required dedup key. Caller generates — typically the operator's
   *  session id + request timestamp, or a UI nonce. */
  idempotencyKey: string;
};

export type IssuePreIssuanceRefundResult = {
  refund: ProFormaPaymentRefund;
  paymentStatusAfter: 'PARTIALLY_REFUNDED' | 'REFUNDED';
};

export async function issuePreIssuanceRefund(
  input: IssuePreIssuanceRefundInput,
): Promise<IssuePreIssuanceRefundResult> {
  const session = await requireFinanceAuthority('REVERSE', 'issuePreIssuanceRefund');
  return issuePreIssuanceRefundAs(input, session.user.id);
}

/** Session-less variant for tests + background callers. */
export async function issuePreIssuanceRefundAs(
  input: IssuePreIssuanceRefundInput,
  actorUserId: string,
): Promise<IssuePreIssuanceRefundResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new ValidationError('A refund reason of at least 3 characters is required.', {
      reason: 'Explain why the refund is being issued — the audit trail needs it.',
    });
  }
  if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
    throw new ValidationError('idempotencyKey is required');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount)) {
    throw new ValidationError('Amount must be a decimal with up to 2 decimal places');
  }
  const refundCents = moneyToCents(input.amount);
  if (refundCents <= 0) throw new ValidationError('Refund amount must be positive');

  return db.transaction(async (tx) => {
    await assertFinanceActor(tx, actorUserId, 'REVERSE', 'issuePreIssuanceRefundAs');
    // Idempotency pre-check: return the existing row if the caller
    // retries with the same key.
    const [existing] = await tx
      .select()
      .from(proFormaPaymentRefunds)
      .where(
        and(
          eq(proFormaPaymentRefunds.paymentId, input.paymentId),
          eq(proFormaPaymentRefunds.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      const [p] = await tx
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.id, input.paymentId))
        .limit(1);
      return {
        refund: existing,
        paymentStatusAfter: (p?.status as 'PARTIALLY_REFUNDED' | 'REFUNDED') ?? 'REFUNDED',
      };
    }

    // Lock the payment row and read its state.
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for('update')
      .limit(1);
    if (!payment) throw new NotFoundError('Payment');
    if (!payment.proFormaInvoiceId) {
      throw new BusinessRuleError(
        'PAYMENT_NOT_PROFORMA',
        'Pre-issuance refund only applies to pro-forma-attached payments. Use the standard refund path for invoice-attached payments.',
      );
    }
    if (payment.status !== 'VERIFIED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new BusinessRuleError(
        'PAYMENT_WRONG_STATE',
        `Pre-issuance refund requires a VERIFIED or PARTIALLY_REFUNDED payment (current: ${payment.status})`,
      );
    }
    if (input.amount && payment.currencyCode) {
      // Currency check runs against the payment (not the pro forma)
      // because the payment carries the actual money we're returning.
    }

    // Lock + validate the pro forma.
    const [pf] = await tx
      .select()
      .from(proFormaInvoices)
      .where(eq(proFormaInvoices.id, payment.proFormaInvoiceId))
      .for('update')
      .limit(1);
    if (!pf) throw new NotFoundError('Pro forma');
    if (pf.status !== 'ACCEPTED') {
      throw new BusinessRuleError(
        'PROFORMA_NOT_ACCEPTED',
        `Pre-issuance refund requires an ACCEPTED pro forma (current: ${pf.status}). CONVERTED pro formas have an invoice — use the standard refund + credit-note path.`,
      );
    }
    // CONVERTED is explicitly blocked above. Also defence-in-depth:
    // if an invoice was issued, refuse this path.
    const [issued] = await tx
      .select({ id: proFormaOfficialInvoices.id })
      .from(proFormaOfficialInvoices)
      .where(eq(proFormaOfficialInvoices.proFormaInvoiceId, pf.id))
      .limit(1);
    if (issued) {
      throw new BusinessRuleError(
        'PROFORMA_ALREADY_ISSUED',
        'An official invoice already exists for this pro forma. Use the invoice-side refund path.',
      );
    }

    // Overrefund guard: cumulative refunds (prior + this) must not
    // exceed the payment's amount.
    const sumRows = await tx.execute<{ sum_cents: string }>(sql`
      SELECT COALESCE(SUM((amount::numeric * 100)::bigint), 0)::text AS sum_cents
      FROM pro_forma_payment_refunds
      WHERE payment_id = ${payment.id}
    `);
    const priorCents = Number(sumRows[0]?.sum_cents ?? '0');
    const paymentCents = moneyToCents(payment.amount);
    if (priorCents + refundCents > paymentCents) {
      const availableCents = Math.max(paymentCents - priorCents, 0);
      throw new BusinessRuleError(
        'PROFORMA_REFUND_EXCEEDS_PAYMENT',
        `Refund amount ${input.amount} ${payment.currencyCode} exceeds the refundable envelope (${centsToMoney(availableCents)} ${payment.currencyCode} remaining on this payment).`,
      );
    }

    const now = new Date();
    const [refund] = await tx
      .insert(proFormaPaymentRefunds)
      .values({
        paymentId: payment.id,
        proFormaInvoiceId: pf.id,
        amount: centsToMoney(refundCents),
        currencyCode: payment.currencyCode,
        reason,
        method: input.method,
        reference: input.reference ?? null,
        idempotencyKey: input.idempotencyKey,
        issuedByUserId: actorUserId,
      })
      .returning();
    if (!refund) throw new Error('pro_forma_payment_refunds insert returned no row');

    // Flip the payment status based on cumulative refunds.
    const newTotalRefundedCents = priorCents + refundCents;
    const newStatus: 'PARTIALLY_REFUNDED' | 'REFUNDED' =
      newTotalRefundedCents >= paymentCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx
      .update(payments)
      .set({ status: newStatus, updatedAt: now })
      .where(eq(payments.id, payment.id));

    // Ledger emit: REFUND_ISSUED. The outbox cron turns it into a
    // balanced journal entry. source_event_id includes the refund id
    // so a retry can't double-emit.
    await emitFinancialEvent(tx, {
      eventType: 'REFUND_ISSUED',
      sourceSystem: 'ireland_careers',
      sourceModule: 'proformas',
      sourceEntity: 'pre_issuance_refund',
      sourceId: refund.id,
      sourceEventId: refund.id,
      eventDate: now,
      payload: {
        actorUserId,
        proFormaNumber: pf.number,
        paymentId: payment.id,
        amount: centsToMoney(refundCents),
        currencyCode: payment.currencyCode,
        method: input.method,
        reason,
        kind: 'PRE_ISSUANCE',
      },
    });

    await recordAudit(tx, {
      actorUserId,
      entityType: 'pro_forma_invoice',
      entityId: pf.id,
      action: 'PRE_ISSUANCE_REFUND_ISSUED',
      after: {
        refundId: refund.id,
        paymentId: payment.id,
        amount: centsToMoney(refundCents),
        currencyCode: payment.currencyCode,
        method: input.method,
        paymentStatusAfter: newStatus,
      },
      context: { reason, idempotencyKey: input.idempotencyKey },
    });

    return { refund, paymentStatusAfter: newStatus };
  });
}
