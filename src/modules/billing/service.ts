import { and, eq, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { assertFinanceActor, requireFinanceAuthority } from '@/lib/auth/finance-policy';
import { db } from '@/lib/db/client';
import {
  creditNotes,
  documentSequences,
  type Invoice,
  invoiceLineItems,
  invoices,
  type Receipt,
  receipts,
  refunds,
} from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { emitFinancialEvent } from '@/modules/accounting/events';
import { resolveDivisionForInvoice } from '@/modules/accounting/rule-engine';

/**
 * Allocate the next number for a (prefix, year) pair. Runs inside a caller-
 * provided transaction and takes a row-level lock (`FOR UPDATE`) so two
 * concurrent finalise-actions can never collide on the same invoice or
 * receipt number. If the sequence row doesn't exist yet for this year, it
 * is inserted at value 1; otherwise the current value is incremented.
 *
 * Returns the formatted string, e.g. `INV-2026-000042`.
 */
export async function allocateNextNumber(
  tx: DbExecutor,
  prefix: 'INV' | 'RCT' | 'CRN' | 'PROF',
  year: number,
): Promise<string> {
  // Take a row-level lock on the sequence row for this (prefix, year), or
  // create it at value 1 if it doesn't exist yet. `INSERT ... ON CONFLICT
  // DO UPDATE ... RETURNING` gives us an atomic upsert-and-return.
  const [row] = await tx
    .insert(documentSequences)
    .values({ prefix, year, currentValue: 1 })
    .onConflictDoUpdate({
      target: [documentSequences.prefix, documentSequences.year],
      set: { currentValue: sql`${documentSequences.currentValue} + 1`, updatedAt: sql`NOW()` },
    })
    .returning({ currentValue: documentSequences.currentValue });
  if (!row) throw new Error('document_sequences upsert returned no row');

  return `${prefix}-${year}-${String(row.currentValue).padStart(6, '0')}`;
}

/**
 * Insert an invoice row inside a caller transaction. Caller must have
 * already validated payer + engagement + currency; this is a low-level
 * insert used by the onboarding finalise action.
 */
/**
 * Insert an invoice inside a caller transaction. The payer is exactly
 * one of `payerPersonId` (candidate / lead flow) or `payerEmployerId`
 * (employer detail page flow) — enforced by the `invoices_payer_xor`
 * CHECK constraint on the table. Passing neither or both throws.
 *
 * Line math (matches the ICG template's QTY / Unit Price / Sub Total
 * / VAT / TOTAL DUE layout):
 *   subtotal    = qty × unitPrice
 *   taxAmount   = subtotal × (vatRatePercent / 100)
 *   totalAmount = subtotal + taxAmount
 *
 * All three are pinned by DB CHECK constraints so a caller can't ship
 * inconsistent numbers. Money stays as strings the whole way to dodge
 * float rounding.
 */
export async function insertInvoice(
  tx: DbExecutor,
  args: {
    payerPersonId?: string | null;
    payerEmployerId?: string | null;
    serviceEngagementId: string;
    qty: number;
    unitPrice: string;
    /** VAT rate to apply, as a percent (e.g. "23.00"). Comes from app_settings. */
    vatRatePercent: string;
    /**
     * Phase 3 blueprint §8.3 — snapshotted VAT treatment. Must be
     * STANDARD unless the invoice is to a non-STANDARD employer, in
     * which case the caller forces the rate to '0.00' before passing
     * it in. Defaults to STANDARD for callers that don't yet care.
     */
    vatTreatment?: 'STANDARD' | 'REVERSE_CHARGE' | 'EXEMPT' | 'OUTSIDE_SCOPE';
    currencyCode: string;
    lineDescription: string;
    issuedByUserId: string;
    /**
     * Phase 3 blueprint §7.2 — number of days from `issuedAt` to the
     * payment due date. Caller computes this from
     * `employer.paymentTermsDays ?? appSettings.defaultPaymentTermsDays`
     * and passes it in; the schema stays agnostic of where the rule
     * came from. Omit for historical invoices or when the caller
     * genuinely has no due-date obligation.
     */
    paymentTermsDays?: number | null;
    /** Optional cross-business back-links. When set, the invoice appears
     *  on the corresponding case / requisition / placement detail page. */
    immigrationCaseId?: string | null;
    jobRequisitionId?: string | null;
    placementId?: string | null;
    sourceLeadId?: string | null;
    /** Optional catalog reference for the single-line invoices produced
     *  by this helper. Mirrored into `invoice_line_items.service_catalog_item_id`
     *  so the invoice detail view can resolve the service. Nullable
     *  because historic callers predate this field. */
    serviceCatalogItemId?: string | null;
    /** Stage B Wave 4 — pass both together for a genuine €0.00
     *  complimentary invoice (CHECK-enforced: reason mandatory, total
     *  must be 0). The row is written PAID: nothing is owed. */
    complimentary?: { reason: string; grantedByUserId: string } | null;
  },
): Promise<Invoice> {
  const hasPerson = Boolean(args.payerPersonId);
  const hasEmployer = Boolean(args.payerEmployerId);
  if (hasPerson === hasEmployer) {
    throw new Error('insertInvoice: exactly one of payerPersonId / payerEmployerId is required');
  }
  if (!Number.isInteger(args.qty) || args.qty <= 0) {
    throw new Error('insertInvoice: qty must be a positive integer');
  }
  const unitPriceCents = parseCents(args.unitPrice);
  const subtotalCents = unitPriceCents * args.qty;
  const vatRate = Number.parseFloat(args.vatRatePercent);
  if (Number.isNaN(vatRate) || vatRate < 0) {
    throw new Error('insertInvoice: vatRatePercent must be a non-negative number');
  }
  // Round half-up to the nearest cent so `qty × unitPrice + tax` never
  // drifts from what the customer sees.
  const taxCents = Math.round((subtotalCents * vatRate) / 100);
  const totalCents = subtotalCents + taxCents;
  if (args.complimentary && totalCents !== 0) {
    throw new Error('insertInvoice: a complimentary invoice must total 0.00');
  }

  const now = new Date();
  const number = await allocateNextNumber(tx, 'INV', now.getUTCFullYear());
  // Phase 3 blueprint §7.2 — compute dueAt from issuedAt + terms.
  const dueAt =
    args.paymentTermsDays != null && args.paymentTermsDays >= 0
      ? new Date(now.getTime() + args.paymentTermsDays * 24 * 60 * 60 * 1000)
      : null;
  const vatTreatment = args.vatTreatment ?? 'STANDARD';
  const [row] = await tx
    .insert(invoices)
    .values({
      number,
      payerPersonId: args.payerPersonId ?? null,
      payerEmployerId: args.payerEmployerId ?? null,
      serviceEngagementId: args.serviceEngagementId,
      qty: args.qty,
      unitPrice: args.unitPrice,
      subtotal: centsToString(subtotalCents),
      taxAmount: centsToString(taxCents),
      totalAmount: centsToString(totalCents),
      currencyCode: args.currencyCode,
      lineDescription: args.lineDescription,
      issuedByUserId: args.issuedByUserId,
      // Complimentary invoices are born settled — nothing is owed. The
      // recompute guard keeps them PAID forever.
      status: args.complimentary ? 'PAID' : 'ISSUED',
      settlementKind: args.complimentary ? 'COMPLIMENTARY' : 'STANDARD',
      complimentaryReason: args.complimentary?.reason ?? null,
      complimentaryGrantedByUserId: args.complimentary?.grantedByUserId ?? null,
      dueAt,
      vatTreatment,
      immigrationCaseId: args.immigrationCaseId ?? null,
      jobRequisitionId: args.jobRequisitionId ?? null,
      placementId: args.placementId ?? null,
      sourceLeadId: args.sourceLeadId ?? null,
    })
    .returning();
  if (!row) throw new Error('invoices insert returned no row');

  // Stage 6B+1 — every live invoice MUST have at least one line_items
  // row (Migration 0053 made the table a hard requirement and its
  // one-time backfill assumed every future insert path matches). Insert
  // the single derived line for this header. Quantity + unit price map
  // 1-to-1 onto the invoice totals; the line subtotal equals the invoice
  // subtotal because this helper only ever produces one-line invoices.
  await tx.insert(invoiceLineItems).values({
    invoiceId: row.id,
    serviceCatalogItemId: args.serviceCatalogItemId ?? null,
    description: args.lineDescription,
    quantity: String(args.qty),
    unitPrice: args.unitPrice,
    lineSubtotal: centsToString(subtotalCents),
    sortOrder: 0,
  });

  // Shadow-record into the ledger. The outbox-drain cron will pick this
  // up and generate a balanced journal via the accounting_rules engine.
  // Idempotent — if the same invoice emits twice (shouldn't happen, but
  // retries exist), the UNIQUE on (source_system, source_event_id)
  // absorbs the duplicate.
  await emitFinancialEvent(tx, {
    eventType: 'INVOICE_POSTED',
    sourceSystem: 'ireland_careers',
    sourceModule: 'billing',
    sourceEntity: 'invoice',
    sourceId: row.id,
    sourceEventId: row.id,
    eventDate: now,
    payload: {
      actorUserId: args.issuedByUserId,
      invoiceNumber: row.number,
      divisionCode: resolveDivisionForInvoice({
        immigrationCaseId: args.immigrationCaseId,
        jobRequisitionId: args.jobRequisitionId,
        placementId: args.placementId,
      }),
      currencyCode: args.currencyCode,
      subtotal: centsToString(subtotalCents),
      taxAmount: centsToString(taxCents),
      total: centsToString(totalCents),
      description: `Invoice ${row.number}`,
    },
  });

  return row;
}

function parseCents(v: string): number {
  const n = Math.round(Number.parseFloat(v) * 100);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`invalid money value: ${v}`);
  }
  return n;
}

function centsToString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Insert a receipt row inside a caller transaction. One receipt per settled
 * payment (enforced by a UNIQUE constraint on receipts.payment_id).
 */
export async function insertReceipt(
  tx: DbExecutor,
  args: {
    paymentId: string;
    invoiceId: string | null;
    payerPersonId?: string | null;
    payerEmployerId?: string | null;
    amount: string;
    currencyCode: string;
    receivedAt: Date;
    issuedByUserId: string;
  },
): Promise<Receipt> {
  // A receipt is proof that money was confirmed — its issuer must hold
  // finance authority, re-checked at the side effect itself.
  await assertFinanceActor(tx, args.issuedByUserId, 'VERIFY', 'insertReceipt');
  const hasPerson = Boolean(args.payerPersonId);
  const hasEmployer = Boolean(args.payerEmployerId);
  if (hasPerson === hasEmployer) {
    throw new Error('insertReceipt: exactly one of payerPersonId / payerEmployerId is required');
  }
  const now = new Date();
  const number = await allocateNextNumber(tx, 'RCT', now.getUTCFullYear());
  const [row] = await tx
    .insert(receipts)
    .values({
      number,
      paymentId: args.paymentId,
      invoiceId: args.invoiceId,
      payerPersonId: args.payerPersonId ?? null,
      payerEmployerId: args.payerEmployerId ?? null,
      amount: args.amount,
      currencyCode: args.currencyCode,
      receivedAt: args.receivedAt,
      issuedByUserId: args.issuedByUserId,
    })
    .returning();
  if (!row) throw new Error('receipts insert returned no row');
  return row;
}

/**
 * Recompute an invoice's payment status from the sum of its VERIFIED
 * payments (minus any credit notes) and flip the row accordingly. Called
 * after every payment verification / rejection / credit-note issuance so
 * the row's `status` reflects reality.
 *
 * Transitions:
 *   ISSUED             — nothing paid yet, no credits
 *   PARTIALLY_PAID     — 0 < paid + credited < total
 *   PAID               — paid + credited ≥ total
 *
 * Never touches VOIDED rows (terminal). Returns the numbers used so the
 * caller can log them.
 */
export async function recomputeInvoiceStatus(
  tx: DbExecutor,
  invoiceId: string,
): Promise<{
  before: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
  after: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
  paidCents: number;
  creditedCents: number;
  totalCents: number;
}> {
  const [row] = await tx
    .select({
      id: invoices.id,
      totalAmount: invoices.totalAmount,
      status: invoices.status,
      settlementKind: invoices.settlementKind,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .for('update')
    .limit(1);
  if (!row) throw new Error(`recomputeInvoiceStatus: invoice ${invoiceId} not found`);
  if (row.status === 'VOIDED') {
    return {
      before: row.status,
      after: row.status,
      paidCents: 0,
      creditedCents: 0,
      totalCents: parseCents(row.totalAmount),
    };
  }

  // Stage B Wave 4 — a complimentary invoice is PAID by definition
  // (nothing is owed) and must never drift to ISSUED or PARTIALLY_PAID.
  // Without this guard a €0.00 total flips to PAID only when something
  // happens to recompute it — nondeterministic — and a stray payment
  // or credit row could never change what "complimentary" means.
  if (row.settlementKind === 'COMPLIMENTARY') {
    if (row.status !== 'PAID') {
      await tx
        .update(invoices)
        .set({ status: 'PAID', updatedAt: sql`NOW()` })
        .where(eq(invoices.id, invoiceId));
    }
    return {
      before: row.status,
      after: 'PAID',
      paidCents: 0,
      creditedCents: 0,
      totalCents: parseCents(row.totalAmount),
    };
  }

  const paid = await sumVerifiedPaymentsCents(tx, invoiceId);
  const credited = await sumCreditNotesCents(tx, invoiceId);
  const totalCents = parseCents(row.totalAmount);
  const settledCents = paid + credited;

  let next: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID';
  if (settledCents >= totalCents) next = 'PAID';
  else if (settledCents > 0) next = 'PARTIALLY_PAID';
  else next = 'ISSUED';

  if (next !== row.status) {
    await tx
      .update(invoices)
      .set({ status: next, updatedAt: sql`NOW()` })
      .where(eq(invoices.id, invoiceId));
  }
  return {
    before: row.status,
    after: next,
    paidCents: paid,
    creditedCents: credited,
    totalCents,
  };
}

/**
 * Sum of amounts on VERIFIED payments linked to this invoice — either
 * directly through the invoice's engagement (the common case) or through
 * a receipt with an explicit `invoice_id` back-link (for edge cases like
 * multi-engagement payers). Never counts PENDING / PROOF_UPLOADED /
 * REJECTED payments.
 */
async function sumVerifiedPaymentsCents(tx: DbExecutor, invoiceId: string): Promise<number> {
  const [row] = await tx
    .select({ paid: sql<string>`COALESCE(SUM(${payments.amount}), 0)::text` })
    .from(payments)
    .innerJoin(invoices, eq(invoices.serviceEngagementId, payments.serviceEngagementId))
    .where(and(eq(invoices.id, invoiceId), eq(payments.status, 'VERIFIED')));
  return parseCents(row?.paid ?? '0');
}

async function sumCreditNotesCents(tx: DbExecutor, invoiceId: string): Promise<number> {
  const [row] = await tx
    .select({ credited: sql<string>`COALESCE(SUM(${creditNotes.amount}), 0)::text` })
    .from(creditNotes)
    .where(eq(creditNotes.invoiceId, invoiceId));
  return parseCents(row?.credited ?? '0');
}

/**
 * Assert that the sum of already-verified payments PLUS this new payment
 * amount does not exceed the invoice total (minus any credit notes).
 * Called from verifyPayment before flipping PENDING → VERIFIED, so
 * accidental double-entry or over-payment is caught up front.
 *
 * Throws OVERPAYMENT if it would overrun. Callers can catch and prompt
 * "issue a refund / adjust the amount instead" — the CRM refuses to
 * silently accept overpayment.
 */
export async function assertNoOverpayment(
  tx: DbExecutor,
  invoiceId: string,
  additionalPaymentCents: number,
): Promise<void> {
  const [row] = await tx
    .select({ totalAmount: invoices.totalAmount })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) return;
  const paid = await sumVerifiedPaymentsCents(tx, invoiceId);
  const credited = await sumCreditNotesCents(tx, invoiceId);
  const totalCents = parseCents(row.totalAmount);
  if (paid + credited + additionalPaymentCents > totalCents) {
    throw new BusinessRuleError(
      'OVERPAYMENT',
      `Verifying this payment would exceed the invoice total. Already settled: ${centsToString(paid + credited)}. This payment: ${centsToString(additionalPaymentCents)}. Total: ${centsToString(totalCents)}. If this is intentional, adjust the amount or issue a refund on the excess.`,
    );
  }
}

/**
 * Void an invoice. Restricted to ADMIN because voiding is destructive to the
 * financial trail — staff who made a mistake must escalate. The invoice row
 * is preserved (audit + accounting) but its status flips to VOIDED with a
 * required reason. Voiding an already-VOIDED or PAID invoice throws — a paid
 * invoice must be refunded (issue a credit note + reverse payment) rather
 * than voided.
 */
export async function voidInvoice(invoiceId: string, reason: string): Promise<Invoice> {
  // Voiding is destructive to the financial trail. ADMIN + FINANCE
  // only; staff who made a mistake must escalate rather than fix in
  // place. Audit trail still records the reason.
  const session = await requireFinanceAuthority('REVERSE', 'voidInvoice');
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new ValidationError('A void reason of at least 3 characters is required.', {
      reason: 'Provide a reason so the audit trail explains the void.',
    });
  }
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .for('update')
      .limit(1);
    if (!before) throw new BusinessRuleError('INVOICE_NOT_FOUND', 'Invoice not found');
    if (before.status === 'VOIDED') {
      throw new BusinessRuleError('INVOICE_ALREADY_VOIDED', 'This invoice is already voided.');
    }
    // Stage B Wave 4 — a complimentary invoice is written as PAID with
    // zero money against it, so "refund + credit note" is meaningless;
    // void-with-reason IS its correction path. Money-backed PAID
    // invoices keep the hard block below.
    if (before.status === 'PAID' && before.settlementKind !== 'COMPLIMENTARY') {
      throw new BusinessRuleError(
        'INVOICE_ALREADY_PAID',
        'A paid invoice cannot be voided. Refund the payment and issue a credit note instead.',
      );
    }

    // Stage 6B — tighten the void guard. Previously an ISSUED or
    // PARTIALLY_PAID invoice could be voided even when verified payments
    // had already been applied, which silently extinguished the demand
    // without a credit-note trail — out of step with Irish VAT practice
    // where every money reversal must be documented. The correct path
    // once money has moved is: issue a credit note (which may be
    // accompanied by a refund). We block the shortcut here.
    const [paidAgg] = await tx.execute<{ paid_cents: string }>(sql`
      SELECT COALESCE(SUM((p.amount * 100)::bigint), 0)::text AS paid_cents
      FROM payments p
      WHERE p.service_engagement_id = ${before.serviceEngagementId}
        AND p.currency_code = ${before.currencyCode}
        AND p.status IN ('VERIFIED', 'PARTIALLY_REFUNDED', 'REFUNDED')
    `);
    const paidCents = Number.parseInt(paidAgg?.paid_cents ?? '0', 10);
    if (paidCents > 0) {
      throw new BusinessRuleError(
        'INVOICE_HAS_VERIFIED_PAYMENTS',
        'This invoice has verified payments against it and cannot be voided. Issue a credit note (and a refund if the money needs to leave the account) so the reversal is documented.',
      );
    }

    const [after] = await tx
      .update(invoices)
      .set({
        status: 'VOIDED',
        voidedAt: sql`NOW()`,
        voidedByUserId: session.user.id,
        voidReason: trimmed,
        updatedAt: sql`NOW()`,
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    if (!after) throw new Error('invoice update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'invoice',
      entityId: after.id,
      action: 'VOIDED',
      before: { status: before.status },
      after: { status: after.status, voidReason: after.voidReason },
    });

    // Stage B Wave 4 — voiding a complimentary invoice reconciles its
    // engagement: the free service was granted BY that invoice, so a
    // live engagement must not stay attached to a voided one. Only
    // not-yet-finished engagements are cancelled (a COMPLETED service
    // was actually delivered — cancelling it would rewrite history),
    // and the candidate profile is never touched: deactivation is a
    // separate, deliberate operator decision because the person may
    // hold other valid services.
    if (before.settlementKind === 'COMPLIMENTARY') {
      const [eng] = await tx
        .select({ id: serviceEngagements.id, status: serviceEngagements.status })
        .from(serviceEngagements)
        .where(eq(serviceEngagements.id, before.serviceEngagementId))
        .for('update')
        .limit(1);
      if (eng && ['REQUESTED', 'PENDING_PAYMENT', 'ACTIVE', 'ON_HOLD'].includes(eng.status)) {
        await tx
          .update(serviceEngagements)
          .set({ status: 'CANCELLED', updatedAt: sql`NOW()` })
          .where(eq(serviceEngagements.id, eng.id));
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'service_engagement',
          entityId: eng.id,
          action: 'CANCELLED',
          before: { status: eng.status },
          after: { status: 'CANCELLED' },
          context: {
            via: 'complimentary_invoice_voided',
            invoiceNumber: after.number,
            reason: trimmed,
          },
        });
      }
    }

    return after;
  });
}

/**
 * Issue a credit note against an existing invoice. Legal correction
 * path for a paid or partially-paid invoice under Irish VAT rules — the
 * original invoice row stays untouched.
 *
 * The amount can be any positive value up to the invoice's outstanding
 * amount PLUS whatever's already been paid (so a full-reversal credit
 * note on a fully-paid invoice is allowed — the operator issues a
 * refund separately). Rejected if it would push the total credited
 * over the invoice total.
 *
 * After the row lands, we call recomputeInvoiceStatus so the invoice
 * flips back to PARTIALLY_PAID (or stays PAID) based on the new
 * settled-vs-total math.
 *
 * ADMIN + FINANCE only. Audited.
 */
export async function issueCreditNote(input: {
  invoiceId: string;
  amount: string;
  reason: string;
}): Promise<{
  id: string;
  number: string;
  invoiceId: string;
  amount: string;
  currencyCode: string;
}> {
  const session = await requireFinanceAuthority('REVERSE', 'issueCreditNote');
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length < 3) {
    throw new ValidationError('A credit-note reason of at least 3 characters is required.', {
      reason: 'Explain what the credit corrects — the audit trail needs it.',
    });
  }
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount)) {
    throw new ValidationError('Amount must be a decimal with up to 2 decimal places.', {
      amount: 'Enter a valid amount like 150 or 150.00',
    });
  }
  const amountCents = Math.round(Number.parseFloat(input.amount) * 100);
  if (amountCents <= 0) {
    throw new ValidationError('Credit-note amount must be greater than zero.', {
      amount: 'Enter a positive amount',
    });
  }

  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select({
        id: invoices.id,
        subtotal: invoices.subtotal,
        taxAmount: invoices.taxAmount,
        totalAmount: invoices.totalAmount,
        currencyCode: invoices.currencyCode,
        status: invoices.status,
        // Back-link columns so we can resolve the correct division for
        // the shadow-ledger event emitted below.
        immigrationCaseId: invoices.immigrationCaseId,
        jobRequisitionId: invoices.jobRequisitionId,
        placementId: invoices.placementId,
        settlementKind: invoices.settlementKind,
      })
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .for('update')
      .limit(1);
    if (!inv) throw new BusinessRuleError('INVOICE_NOT_FOUND', 'Invoice not found');
    if (inv.status === 'VOIDED') {
      throw new BusinessRuleError(
        'INVOICE_VOIDED',
        'Cannot credit a voided invoice — the row is already reversed.',
      );
    }
    // Stage B Wave 4 — nothing to credit against €0.00, and a CRN here
    // would corrupt the settled-total math that drives invoice status.
    // The correction path for a complimentary invoice is void + reissue.
    if (inv.settlementKind === 'COMPLIMENTARY') {
      throw new BusinessRuleError(
        'INVOICE_COMPLIMENTARY',
        'A complimentary (€0.00) invoice has nothing to credit. Void it with a reason and reissue instead.',
      );
    }

    // Ceiling: total_amount - already_credited. Existing verified
    // payments don't affect this cap — a credit note against a paid
    // invoice is legitimate (refund happens off-system).
    const [{ credited }] = await tx
      .select({
        credited: sql<string>`COALESCE(SUM(${creditNotes.amount}), 0)::text`,
      })
      .from(creditNotes)
      .where(eq(creditNotes.invoiceId, input.invoiceId));
    const totalCents = Math.round(Number.parseFloat(inv.totalAmount) * 100);
    const alreadyCreditedCents = Math.round(Number.parseFloat(credited) * 100);
    if (alreadyCreditedCents + amountCents > totalCents) {
      throw new BusinessRuleError(
        'CREDIT_EXCEEDS_TOTAL',
        `Total credit against this invoice would exceed the invoice total (${(totalCents / 100).toFixed(2)}). Existing credit: ${(alreadyCreditedCents / 100).toFixed(2)}; this credit: ${(amountCents / 100).toFixed(2)}.`,
      );
    }

    // Pro-rate the invoice's tax across the credit so the VAT subledger
    // can post an exact reversal.
    const invTotalCents = Math.round(Number.parseFloat(inv.totalAmount) * 100);
    const invTaxCents = Math.round(Number.parseFloat(inv.taxAmount) * 100);
    const creditTaxCents =
      invTotalCents > 0 ? Math.round((amountCents * invTaxCents) / invTotalCents) : 0;
    const creditNetCents = amountCents - creditTaxCents;

    const now = new Date();
    const number = await allocateNextNumber(tx, 'CRN', now.getUTCFullYear());
    const [row] = await tx
      .insert(creditNotes)
      .values({
        number,
        invoiceId: input.invoiceId,
        amount: input.amount,
        taxAmount: (creditTaxCents / 100).toFixed(2),
        currencyCode: inv.currencyCode,
        reason: trimmedReason,
        issuedByUserId: session.user.id,
      })
      .returning();
    if (!row) throw new Error('credit_notes insert returned no row');

    // Recompute invoice status now that "settled" includes this
    // credit. A previously PAID invoice may flip back to
    // PARTIALLY_PAID if the credit brought (payments + credits) below
    // total — that's the desired behaviour.
    const change = await recomputeInvoiceStatus(tx, input.invoiceId);

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'credit_note',
      entityId: row.id,
      action: 'CREATED',
      after: {
        number: row.number,
        invoiceId: row.invoiceId,
        amount: row.amount,
        reason: row.reason,
      },
      context: {
        invoiceStatusBefore: change.before,
        invoiceStatusAfter: change.after,
      },
    });
    if (change.before !== change.after) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: input.invoiceId,
        action: 'STATUS_CHANGED',
        before: { status: change.before },
        after: { status: change.after },
        context: { via: 'credit_note_issued', creditNoteId: row.id, creditNoteNumber: row.number },
      });
    }

    // Shadow-record the credit note in the ledger. Subtotal + tax are
    // sent NEGATIVE so the outbox-drain's sign-flip logic produces the
    // reversed debit/credit movement (DR Revenue / CR AR; DR VAT
    // Payable / CR AR) relative to an invoice posting. The tax split
    // is pro-rated from the originating invoice so the VAT subledger
    // can net it against the original T1 output.
    await emitFinancialEvent(tx, {
      eventType: 'CREDIT_NOTE_POSTED',
      sourceSystem: 'ireland_careers',
      sourceModule: 'billing',
      sourceEntity: 'credit_note',
      sourceId: row.id,
      sourceEventId: row.id,
      eventDate: now,
      payload: {
        actorUserId: session.user.id,
        creditNoteNumber: row.number,
        invoiceId: inv.id,
        divisionCode: resolveDivisionForInvoice({
          immigrationCaseId: inv.immigrationCaseId,
          jobRequisitionId: inv.jobRequisitionId,
          placementId: inv.placementId,
        }),
        currencyCode: row.currencyCode,
        subtotal: `-${(creditNetCents / 100).toFixed(2)}`,
        taxAmount: `-${(creditTaxCents / 100).toFixed(2)}`,
        total: `-${input.amount}`,
        description: `Credit note ${row.number} against invoice`,
      },
    });

    return {
      id: row.id,
      number: row.number,
      invoiceId: row.invoiceId,
      amount: row.amount,
      currencyCode: row.currencyCode,
    };
  });
}

/**
 * Issue a refund against a specific verified payment.
 *
 * Phase-1 of docs/ux-audit-blueprint.md §7.1. Before this landed, refunds
 * "happened off-system" — operators issued a credit note, moved money via
 * their bank, and the CRM had no record cash had been returned. That's a
 * bookkeeping disaster for any business processing payments at scale.
 *
 * This function does five things atomically:
 *   1. Validates the refund is within the refundable envelope
 *      (payment.amount − already-refunded).
 *   2. Issues a credit note against the invoice tied to the payment, so
 *      the legal/VAT reversal is captured correctly (pro-rated tax).
 *   3. Inserts the refund row, linking payment + credit note + method +
 *      external reference.
 *   4. Flips the payment status to PARTIALLY_REFUNDED or REFUNDED based
 *      on remaining refundable.
 *   5. Recomputes the invoice status (handled inside the credit-note
 *      path) + records audit events for both artefacts.
 *
 * ADMIN + FINANCE only.
 */
export async function issueRefund(input: {
  paymentId: string;
  amount: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  reason: string;
  reference?: string;
}): Promise<{
  refundId: string;
  creditNoteNumber: string;
  paymentStatusAfter: 'PARTIALLY_REFUNDED' | 'REFUNDED';
}> {
  const session = await requireFinanceAuthority('REVERSE', 'issueRefund');
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length < 3) {
    throw new ValidationError('A refund reason of at least 3 characters is required.', {
      reason: 'Explain why the refund is being issued — the audit trail needs it.',
    });
  }
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount)) {
    throw new ValidationError('Amount must be a decimal with up to 2 decimal places.', {
      amount: 'Enter a valid amount like 150 or 150.00',
    });
  }
  const refundCents = Math.round(Number.parseFloat(input.amount) * 100);
  if (refundCents <= 0) {
    throw new ValidationError('Refund amount must be greater than zero.', {
      amount: 'Enter a positive amount',
    });
  }

  return db.transaction(async (tx) => {
    // 1. Lock the payment row + load its linked invoice.
    const [pay] = await tx
      .select({
        id: payments.id,
        amount: payments.amount,
        currencyCode: payments.currencyCode,
        status: payments.status,
        serviceEngagementId: payments.serviceEngagementId,
      })
      .from(payments)
      .where(eq(payments.id, input.paymentId))
      .for('update')
      .limit(1);
    if (!pay) throw new BusinessRuleError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (pay.status !== 'VERIFIED' && pay.status !== 'PARTIALLY_REFUNDED') {
      throw new BusinessRuleError(
        'PAYMENT_NOT_REFUNDABLE',
        `Cannot refund a payment in status ${pay.status}. Only verified or partially-refunded payments can be refunded.`,
      );
    }

    // The invoice associated with this payment via the engagement.
    const [inv] = await tx
      .select({
        id: invoices.id,
        subtotal: invoices.subtotal,
        taxAmount: invoices.taxAmount,
        totalAmount: invoices.totalAmount,
        currencyCode: invoices.currencyCode,
        status: invoices.status,
        immigrationCaseId: invoices.immigrationCaseId,
        jobRequisitionId: invoices.jobRequisitionId,
        placementId: invoices.placementId,
      })
      .from(invoices)
      .where(eq(invoices.serviceEngagementId, pay.serviceEngagementId))
      .for('update')
      .limit(1);
    if (!inv) {
      throw new BusinessRuleError(
        'INVOICE_NOT_FOUND',
        'No invoice tied to this payment — refund cannot be issued without a VAT-reversal path.',
      );
    }

    // 2. Compute refund envelope: payment.amount − already-refunded.
    const paymentCents = Math.round(Number.parseFloat(pay.amount) * 100);
    const [{ refunded }] = await tx
      .select({
        refunded: sql<string>`COALESCE(SUM(${refunds.amount}), 0)::text`,
      })
      .from(refunds)
      .where(eq(refunds.paymentId, pay.id));
    const alreadyRefundedCents = Math.round(Number.parseFloat(refunded) * 100);
    const remainingRefundableCents = paymentCents - alreadyRefundedCents;
    if (refundCents > remainingRefundableCents) {
      throw new BusinessRuleError(
        'REFUND_EXCEEDS_REMAINING',
        `Refund amount exceeds the remaining refundable (${(remainingRefundableCents / 100).toFixed(2)} ${pay.currencyCode}).`,
      );
    }

    // 3. Issue the credit note inline (same tx — can't call issueCreditNote
    //    which starts its own transaction). Mirrors the credit-note code
    //    path exactly: pro-rated tax, next-number allocation, audit.
    const invTotalCents = Math.round(Number.parseFloat(inv.totalAmount) * 100);
    const invTaxCents = Math.round(Number.parseFloat(inv.taxAmount) * 100);
    const creditTaxCents =
      invTotalCents > 0 ? Math.round((refundCents * invTaxCents) / invTotalCents) : 0;
    const creditNetCents = refundCents - creditTaxCents;

    const now = new Date();
    const creditNoteNumber = await allocateNextNumber(tx, 'CRN', now.getUTCFullYear());
    const [creditRow] = await tx
      .insert(creditNotes)
      .values({
        number: creditNoteNumber,
        invoiceId: inv.id,
        amount: input.amount,
        taxAmount: (creditTaxCents / 100).toFixed(2),
        currencyCode: inv.currencyCode,
        reason: `Refund: ${trimmedReason}`,
        issuedByUserId: session.user.id,
      })
      .returning();
    if (!creditRow) throw new Error('credit_notes insert returned no row');

    // 4. Insert the refund row — links payment + credit note.
    const [refundRow] = await tx
      .insert(refunds)
      .values({
        paymentId: pay.id,
        creditNoteId: creditRow.id,
        amount: input.amount,
        currencyCode: pay.currencyCode,
        reason: trimmedReason,
        method: input.method,
        reference: input.reference?.trim() || null,
        issuedByUserId: session.user.id,
      })
      .returning({ id: refunds.id });
    if (!refundRow) throw new Error('refunds insert returned no row');

    // 5. Update payment status based on remaining refundable after this hop.
    const newAlreadyRefunded = alreadyRefundedCents + refundCents;
    const newPaymentStatus: 'PARTIALLY_REFUNDED' | 'REFUNDED' =
      newAlreadyRefunded >= paymentCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx
      .update(payments)
      .set({ status: newPaymentStatus, updatedAt: sql`NOW()` })
      .where(eq(payments.id, pay.id));

    // 6. Recompute invoice status (credit note shifts the settled total).
    const change = await recomputeInvoiceStatus(tx, inv.id);

    // 7. Audit — one event each for refund, credit note, payment, invoice.
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'refund',
      entityId: refundRow.id,
      action: 'CREATED',
      after: {
        paymentId: pay.id,
        creditNoteId: creditRow.id,
        amount: input.amount,
        method: input.method,
        reason: trimmedReason,
      },
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'credit_note',
      entityId: creditRow.id,
      action: 'CREATED',
      after: {
        number: creditRow.number,
        invoiceId: creditRow.invoiceId,
        amount: creditRow.amount,
        reason: creditRow.reason,
      },
      context: { via: 'refund', refundId: refundRow.id },
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'payment',
      entityId: pay.id,
      action: 'STATUS_CHANGED',
      before: { status: pay.status },
      after: { status: newPaymentStatus },
      context: { via: 'refund', refundId: refundRow.id },
    });
    if (change.before !== change.after) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: inv.id,
        action: 'STATUS_CHANGED',
        before: { status: change.before },
        after: { status: change.after },
        context: { via: 'refund', refundId: refundRow.id, creditNoteNumber: creditRow.number },
      });
    }

    // 8. Shadow-ledger the credit-note side so VAT subledger reverses
    //    correctly — same shape as issueCreditNote's emission.
    await emitFinancialEvent(tx, {
      eventType: 'CREDIT_NOTE_POSTED',
      sourceSystem: 'ireland_careers',
      sourceModule: 'billing',
      sourceEntity: 'credit_note',
      sourceId: creditRow.id,
      sourceEventId: creditRow.id,
      eventDate: now,
      payload: {
        actorUserId: session.user.id,
        creditNoteNumber: creditRow.number,
        invoiceId: inv.id,
        divisionCode: resolveDivisionForInvoice({
          immigrationCaseId: inv.immigrationCaseId,
          jobRequisitionId: inv.jobRequisitionId,
          placementId: inv.placementId,
        }),
        currencyCode: creditRow.currencyCode,
        subtotal: `-${(creditNetCents / 100).toFixed(2)}`,
        taxAmount: `-${(creditTaxCents / 100).toFixed(2)}`,
        total: `-${input.amount}`,
        description: `Refund ${(refundCents / 100).toFixed(2)} ${pay.currencyCode} on payment ${pay.id}`,
      },
    });

    return {
      refundId: refundRow.id,
      creditNoteNumber: creditRow.number,
      paymentStatusAfter: newPaymentStatus,
    };
  });
}

/**
 * Fetch an invoice by its printable number (`INV-2026-000042`).
 */
export async function findInvoiceByNumber(tx: DbExecutor, number: string): Promise<Invoice | null> {
  const [row] = await tx.select().from(invoices).where(eq(invoices.number, number)).limit(1);
  return row ?? null;
}

/**
 * Fetch a receipt by its printable number.
 */
export async function findReceiptByNumber(tx: DbExecutor, number: string): Promise<Receipt | null> {
  const [row] = await tx.select().from(receipts).where(eq(receipts.number, number)).limit(1);
  return row ?? null;
}
