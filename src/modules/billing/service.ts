import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import {
  documentSequences,
  type Invoice,
  invoices,
  type Receipt,
  receipts,
} from '@/lib/db/schema/billing';

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
