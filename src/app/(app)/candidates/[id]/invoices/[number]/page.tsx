import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoicePrintable } from '@/components/billing/invoice-printable';
import { IssueRefundControls } from '@/components/billing/issue-refund-controls';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import {
  fetchCreditNotesForInvoice,
  fetchInvoiceForPrint,
  fetchRefundablePaymentsForInvoice,
} from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';
import { CreditNoteControls } from './credit-note-controls';
import { VoidInvoiceControls } from './void-invoice-controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoice' };

/**
 * Person-scoped printable invoice. Refuses when the invoice is
 * actually employer-paid (URL narrowing) or when the person doesn't
 * match. Delegates the visual template to `<InvoicePrintable>` so
 * both routes render identically.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  const session = await requireInternalStaff();
  const { id, number } = await params;
  const [data, settings] = await Promise.all([fetchInvoiceForPrint(number), fetchAppSettings()]);
  if (data?.payer.kind !== 'PERSON' || data.payer.person.id !== id) notFound();

  const person = data.payer.person;
  const canVoid = session.user.role === 'ADMIN' && data.invoice.status === 'ISSUED';
  const canCredit =
    (session.user.role === 'ADMIN' || session.user.role === 'FINANCE') &&
    data.invoice.status !== 'VOIDED';

  // Load credit notes for this invoice — used both to render the
  // "Credit notes" section on the printable and to compute the max
  // credit-note amount available for the issue dialog.
  const existingCreditNotes = await fetchCreditNotesForInvoice(data.invoice.id);
  const refundablePayments =
    canCredit && data.invoice.status !== 'VOIDED'
      ? await fetchRefundablePaymentsForInvoice(data.invoice.id)
      : [];
  const alreadyCreditedCents = existingCreditNotes.reduce(
    (sum, c) => sum + Math.round(Number.parseFloat(c.amount) * 100),
    0,
  );
  const invoiceTotalCents = Math.round(Number.parseFloat(data.invoice.totalAmount) * 100);
  const maxCreditCents = Math.max(0, invoiceTotalCents - alreadyCreditedCents);
  const maxCreditAmount = (maxCreditCents / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6 print:hidden">
        <Link
          href={`/candidates/${id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back to candidate
        </Link>
        <div className="flex items-center gap-2">
          {canVoid && (
            <VoidInvoiceControls
              invoiceId={data.invoice.id}
              invoiceNumber={data.invoice.number}
              personId={id}
            />
          )}
          {canCredit && maxCreditCents > 0 && (
            <CreditNoteControls
              invoiceId={data.invoice.id}
              invoiceNumber={data.invoice.number}
              profileHref={`/candidates/${id}`}
              currencyCode={data.invoice.currencyCode}
              maxCreditAmount={maxCreditAmount}
            />
          )}
          {refundablePayments.length > 0 && (
            <IssueRefundControls
              invoiceNumber={data.invoice.number}
              profileHref={`/candidates/${id}`}
              refundablePayments={refundablePayments}
            />
          )}
          <PrintButton />
        </div>
      </div>

      {/* Correction-path banner — invoices are immutable by design (Irish
          VAT rules + audit trail). This banner surfaces the two legal
          correction paths right at the top so staff don't go hunting for
          an Edit button that doesn't exist. */}
      {(canVoid || (canCredit && maxCreditCents > 0)) && (
        <div className="mx-auto mt-3 max-w-3xl px-6 print:hidden">
          <div className="rounded-md border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <strong className="font-semibold">Need to correct the amount?</strong>{' '}
            {data.invoice.status === 'ISSUED'
              ? "Nothing paid yet — Void the invoice above and generate a fresh one from the candidate's Billing tab."
              : "Issue a credit note above to reduce what's owed, then raise a second invoice from the candidate's Billing tab for the correct amount. Invoices are final once paid — this is required by Irish VAT rules."}
          </div>
        </div>
      )}

      <InvoicePrintable
        invoice={data.invoice}
        settings={settings}
        payer={{
          displayName: `${person.firstName} ${person.lastName}`.trim(),
          contactRows: [
            person.email ? { label: 'Customer Email', value: person.email } : null,
            person.phone ? { label: 'Customer Telephone Contact', value: person.phone } : null,
          ].filter((r): r is { label: string; value: string } => r !== null),
        }}
        lineItems={data.lineItems}
        creditNotes={existingCreditNotes}
      />
    </div>
  );
}
