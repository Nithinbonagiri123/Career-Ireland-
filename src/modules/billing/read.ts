import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
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
  await requireRole(['ADMIN', 'STAFF']);
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

export async function fetchReceiptForPrint(number: string): Promise<ReceiptPrintable | null> {
  await requireRole(['ADMIN', 'STAFF']);
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
