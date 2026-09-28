import { and, eq, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  creditNotes,
  documentSequences,
  type Invoice,
  invoices,
  type Receipt,
  receipts,
} from '@/lib/db/schema/billing';
import { payments } from '@/lib/db/schema/commerce';
import { BusinessRuleError, ValidationError } from '@/lib/errors';

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
  prefix: 'INV' | 'RCT' | 'CRN',
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
    currencyCode: string;
    lineDescription: string;
    issuedByUserId: string;
    /** Optional cross-business back-links. When set, the invoice appears
     *  on the corresponding case / requisition / placement detail page. */
    immigrationCaseId?: string | null;
    jobRequisitionId?: string | null;
    placementId?: string | null;
    sourceLeadId?: string | null;
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

  const now = new Date();
  const number = await allocateNextNumber(tx, 'INV', now.getUTCFullYear());
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
      status: 'ISSUED',
      immigrationCaseId: args.immigrationCaseId ?? null,
      jobRequisitionId: args.jobRequisitionId ?? null,
      placementId: args.placementId ?? null,
      sourceLeadId: args.sourceLeadId ?? null,
    })
    .returning();
  if (!row) throw new Error('invoices insert returned no row');
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
  const session = await requireRole(['ADMIN', 'FINANCE']);
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
    if (before.status === 'PAID') {
      throw new BusinessRuleError(
        'INVOICE_ALREADY_PAID',
        'A paid invoice cannot be voided. Refund the payment and issue a credit note instead.',
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

    return after;
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
