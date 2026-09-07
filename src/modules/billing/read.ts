import { desc, eq } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices, receipts } from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { persons } from '@/lib/db/schema/persons';
import { serviceCatalogItems } from '@/lib/db/schema/services';

/**
 * Read helpers used by the print-friendly invoice / receipt pages.
 * They pull all the joined context a printable page needs in one go.
 */

export type InvoicePrintable = {
  invoice: typeof invoices.$inferSelect;
  payer: typeof persons.$inferSelect;
  engagement: typeof serviceEngagements.$inferSelect;
  catalogItem: typeof serviceCatalogItems.$inferSelect;
};

export async function fetchInvoiceForPrint(number: string): Promise<InvoicePrintable | null> {
  await requireInternalStaff();
  const [row] = await db
    .select({
      invoice: invoices,
      payer: persons,
      engagement: serviceEngagements,
      catalogItem: serviceCatalogItems,
    })
    .from(invoices)
    .innerJoin(persons, eq(persons.id, invoices.payerPersonId))
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, invoices.serviceEngagementId))
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(eq(invoices.number, number))
    .limit(1);
  return row ?? null;
}

export type ReceiptPrintable = {
  receipt: typeof receipts.$inferSelect;
  payer: typeof persons.$inferSelect;
  payment: typeof payments.$inferSelect;
  invoice: typeof invoices.$inferSelect | null;
};

/**
 * Latest invoice + receipt numbers for a candidate, used by the "just created"
 * success card on the candidate detail page. Both are optional — a person may
 * have no billing history at all, in which case the card is not rendered.
 */
export async function fetchLatestBillingLinksForPerson(personId: string): Promise<{
  invoiceNumber: string | null;
  receiptNumber: string | null;
}> {
  await requireInternalStaff();
  const [invoiceRow, receiptRow] = await Promise.all([
    db
      .select({ number: invoices.number })
      .from(invoices)
      .where(eq(invoices.payerPersonId, personId))
      .orderBy(desc(invoices.issuedAt))
      .limit(1),
    db
      .select({ number: receipts.number })
      .from(receipts)
      .where(eq(receipts.payerPersonId, personId))
      .orderBy(desc(receipts.issuedAt))
      .limit(1),
  ]);
  return {
    invoiceNumber: invoiceRow[0]?.number ?? null,
    receiptNumber: receiptRow[0]?.number ?? null,
  };
}

export async function fetchReceiptForPrint(number: string): Promise<ReceiptPrintable | null> {
  await requireInternalStaff();
  const [row] = await db
    .select({
      receipt: receipts,
      payer: persons,
      payment: payments,
      invoice: invoices,
    })
    .from(receipts)
    .innerJoin(persons, eq(persons.id, receipts.payerPersonId))
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .leftJoin(invoices, eq(invoices.id, receipts.invoiceId))
    .where(eq(receipts.number, number))
    .limit(1);
  return row ? { ...row, invoice: row.invoice ?? null } : null;
}
