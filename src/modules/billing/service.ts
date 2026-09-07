import { and, eq, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  documentSequences,
  type Invoice,
  invoices,
  type Receipt,
  receipts,
} from '@/lib/db/schema/billing';
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
  prefix: 'INV' | 'RCT',
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
export async function insertInvoice(
  tx: DbExecutor,
  args: {
    payerPersonId: string;
    serviceEngagementId: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    currencyCode: string;
    lineDescription: string;
    issuedByUserId: string;
  },
): Promise<Invoice> {
  const now = new Date();
  const number = await allocateNextNumber(tx, 'INV', now.getUTCFullYear());
  const [row] = await tx
    .insert(invoices)
    .values({
      number,
      payerPersonId: args.payerPersonId,
      serviceEngagementId: args.serviceEngagementId,
      subtotal: args.subtotal,
      taxAmount: args.taxAmount,
      totalAmount: args.totalAmount,
      currencyCode: args.currencyCode,
      lineDescription: args.lineDescription,
      issuedByUserId: args.issuedByUserId,
      status: 'ISSUED',
    })
    .returning();
  if (!row) throw new Error('invoices insert returned no row');
  return row;
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
    payerPersonId: string;
    amount: string;
    currencyCode: string;
    receivedAt: Date;
    issuedByUserId: string;
  },
): Promise<Receipt> {
  const now = new Date();
  const number = await allocateNextNumber(tx, 'RCT', now.getUTCFullYear());
  const [row] = await tx
    .insert(receipts)
    .values({
      number,
      paymentId: args.paymentId,
      invoiceId: args.invoiceId,
      payerPersonId: args.payerPersonId,
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
 * Mark an invoice as PAID. Called once its linked receipt is issued.
 */
export async function markInvoicePaid(tx: DbExecutor, invoiceId: string): Promise<void> {
  await tx
    .update(invoices)
    .set({ status: 'PAID', updatedAt: sql`NOW()` })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, 'ISSUED')));
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
