import { and, asc, desc, eq, or } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices, receipts } from '@/lib/db/schema/billing';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import { serviceCatalogItems, servicePackages } from '@/lib/db/schema/services';

/**
 * Read helpers used by the print-friendly invoice / receipt pages.
 * They pull all the joined context a printable page needs in one go.
 */

/**
 * Options for the invoice-generation dialog: active services the payer
 * (PERSON or EMPLOYER) can be invoiced for, plus each service's active
 * packages so the currency + price picker is prefilled.
 *
 * Services with no packages (e.g. "Work Permit — price on enquiry")
 * come back with an empty packages array; the dialog then requires the
 * operator to enter amount + currency manually.
 */
export type InvoiceableService = {
  id: string;
  code: string;
  name: string;
  payerType: 'PERSON' | 'EMPLOYER' | 'ANY';
  packages: Array<{
    id: string;
    name: string;
    price: string;
    currencyCode: string;
  }>;
};

export async function fetchInvoiceableServicesFor(
  payerMode: 'PERSON' | 'EMPLOYER',
): Promise<InvoiceableService[]> {
  const rows = await db
    .select({
      id: serviceCatalogItems.id,
      code: serviceCatalogItems.code,
      name: serviceCatalogItems.name,
      payerType: serviceCatalogItems.payerType,
    })
    .from(serviceCatalogItems)
    .where(
      and(
        eq(serviceCatalogItems.isActive, true),
        or(eq(serviceCatalogItems.payerType, payerMode), eq(serviceCatalogItems.payerType, 'ANY')),
      ),
    )
    .orderBy(asc(serviceCatalogItems.name));

  if (rows.length === 0) return [];

  const packageRows = await db
    .select({
      id: servicePackages.id,
      name: servicePackages.name,
      price: servicePackages.price,
      currencyCode: servicePackages.currencyCode,
      serviceCatalogItemId: servicePackages.serviceCatalogItemId,
    })
    .from(servicePackages)
    .where(eq(servicePackages.isActive, true))
    .orderBy(asc(servicePackages.currencyCode));

  const bySvc = new Map<string, InvoiceableService['packages']>();
  for (const p of packageRows) {
    const arr = bySvc.get(p.serviceCatalogItemId);
    const entry = { id: p.id, name: p.name, price: p.price, currencyCode: p.currencyCode };
    if (arr) arr.push(entry);
    else bySvc.set(p.serviceCatalogItemId, [entry]);
  }

  return rows.map((r) => ({
    ...r,
    payerType: r.payerType as 'PERSON' | 'EMPLOYER' | 'ANY',
    packages: bySvc.get(r.id) ?? [],
  }));
}

/**
 * Payer view for printable documents. Discriminated by `kind` so the
 * candidate print page can narrow to a Person and the employer print
 * page can narrow to an Employer without either page needing to
 * de-null the other's payer id. Backed by the DB CHECK constraint
 * that exactly one payer FK is populated per invoice / receipt.
 */
export type PrintablePayer =
  | { kind: 'PERSON'; person: typeof persons.$inferSelect }
  | { kind: 'EMPLOYER'; employer: typeof employers.$inferSelect };

export type InvoicePrintable = {
  invoice: typeof invoices.$inferSelect;
  payer: PrintablePayer;
  engagement: typeof serviceEngagements.$inferSelect;
  catalogItem: typeof serviceCatalogItems.$inferSelect;
};

export async function fetchInvoiceForPrint(number: string): Promise<InvoicePrintable | null> {
  await requireInternalStaff();
  const [row] = await db
    .select({
      invoice: invoices,
      person: persons,
      employer: employers,
      engagement: serviceEngagements,
      catalogItem: serviceCatalogItems,
    })
    .from(invoices)
    .leftJoin(persons, eq(persons.id, invoices.payerPersonId))
    .leftJoin(employers, eq(employers.id, invoices.payerEmployerId))
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, invoices.serviceEngagementId))
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(eq(invoices.number, number))
    .limit(1);
  if (!row) return null;
  const payer: PrintablePayer | null = row.person
    ? { kind: 'PERSON', person: row.person }
    : row.employer
      ? { kind: 'EMPLOYER', employer: row.employer }
      : null;
  if (!payer) return null;
  return {
    invoice: row.invoice,
    payer,
    engagement: row.engagement,
    catalogItem: row.catalogItem,
  };
}

export type ReceiptPrintable = {
  receipt: typeof receipts.$inferSelect;
  payer: PrintablePayer;
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

/**
 * Full billing history for a person profile — every invoice ever issued
 * to them and every receipt ever recorded against their payments.
 *
 * Rendered by the "Billing" tab on `/candidates/[id]`. The tab has to
 * work equally well for people still in the lead stage (a person can
 * have invoices before any candidate profile exists), so we key off
 * `payer_person_id` on both tables — not off candidate_profiles.
 *
 * Ordered newest-first; small volumes (typical caseload is < 20 docs
 * per person) so no pagination.
 */
export type PersonBillingRow = {
  invoice: typeof invoices.$inferSelect;
  serviceName: string;
};

export type PersonReceiptRow = {
  receipt: typeof receipts.$inferSelect;
  invoiceNumber: string | null;
};

export async function fetchPersonBillingHistory(personId: string): Promise<{
  invoices: PersonBillingRow[];
  receipts: PersonReceiptRow[];
}> {
  await requireInternalStaff();
  const [invoiceRows, receiptRows] = await Promise.all([
    db
      .select({
        invoice: invoices,
        serviceName: serviceCatalogItems.name,
      })
      .from(invoices)
      .innerJoin(serviceEngagements, eq(serviceEngagements.id, invoices.serviceEngagementId))
      .innerJoin(
        serviceCatalogItems,
        eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
      )
      .where(eq(invoices.payerPersonId, personId))
      .orderBy(desc(invoices.issuedAt)),
    db
      .select({
        receipt: receipts,
        invoiceNumber: invoices.number,
      })
      .from(receipts)
      .leftJoin(invoices, eq(invoices.id, receipts.invoiceId))
      .where(eq(receipts.payerPersonId, personId))
      .orderBy(desc(receipts.issuedAt)),
  ]);
  return {
    invoices: invoiceRows.map((r) => ({ invoice: r.invoice, serviceName: r.serviceName })),
    receipts: receiptRows.map((r) => ({ receipt: r.receipt, invoiceNumber: r.invoiceNumber })),
  };
}

export async function fetchReceiptForPrint(number: string): Promise<ReceiptPrintable | null> {
  await requireInternalStaff();
  const [row] = await db
    .select({
      receipt: receipts,
      person: persons,
      employer: employers,
      payment: payments,
      invoice: invoices,
    })
    .from(receipts)
    .leftJoin(persons, eq(persons.id, receipts.payerPersonId))
    .leftJoin(employers, eq(employers.id, receipts.payerEmployerId))
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .leftJoin(invoices, eq(invoices.id, receipts.invoiceId))
    .where(eq(receipts.number, number))
    .limit(1);
  if (!row) return null;
  const payer: PrintablePayer | null = row.person
    ? { kind: 'PERSON', person: row.person }
    : row.employer
      ? { kind: 'EMPLOYER', employer: row.employer }
      : null;
  if (!payer) return null;
  return {
    receipt: row.receipt,
    payer,
    payment: row.payment,
    invoice: row.invoice ?? null,
  };
}
