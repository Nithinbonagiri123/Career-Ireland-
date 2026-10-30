import { format } from 'date-fns';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoicePrintable } from '@/components/billing/invoice-printable';
import { IssueRefundControls } from '@/components/billing/issue-refund-controls';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import {
  fetchCreditNotesForInvoice,
  fetchInvoiceForPrint,
  fetchInvoicePaymentTrail,
  fetchRefundablePaymentsForInvoice,
} from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';
import { CreditNoteControls } from './credit-note-controls';
import { InvoiceDetailTabs, type RelatedRecordLink } from './invoice-detail-tabs';
import { VoidInvoiceControls } from './void-invoice-controls';

const INVOICE_STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  VOIDED: 'Voided',
};

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
  // Stage B Wave 4 — complimentary invoices: PAID-with-no-money, so the
  // money controls (credit note, refund) make no sense and are blocked
  // server-side too; void-with-reason IS their correction path, PAID
  // notwithstanding.
  const isComplimentary = data.invoice.settlementKind === 'COMPLIMENTARY';
  const canVoid =
    session.user.role === 'ADMIN' &&
    (data.invoice.status === 'ISSUED' || (isComplimentary && data.invoice.status !== 'VOIDED'));
  const canCredit =
    !isComplimentary &&
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

  // Stage 6G Screen 10 — payments + related records for the tab shell.
  const paymentTrail = await fetchInvoicePaymentTrail(data.invoice.id);
  const latestPaid = paymentTrail.find((p) => p.status === 'VERIFIED');
  const paymentReceivedNote =
    data.invoice.status === 'PAID' && latestPaid
      ? `This invoice has been fully paid. Payment was received on ${format(
          latestPaid.receivedAt ?? latestPaid.createdAt,
          'dd MMM yyyy',
        )} via ${latestPaid.method.replace(/_/g, ' ').toLowerCase()}${
          latestPaid.proofReference ? ` (Ref: ${latestPaid.proofReference})` : ''
        }.`
      : null;
  const relatedRecords: RelatedRecordLink[] = [
    {
      key: 'candidate',
      label: 'Candidate workspace',
      detail: `${person.firstName} ${person.lastName}`.trim(),
      href: `/clients/${id}?tab=services-billing`,
    },
    ...paymentTrail
      .filter((p) => p.receiptNumber)
      .map((p) => ({
        key: `receipt-${p.id}`,
        label: `Receipt ${p.receiptNumber}`,
        detail: `${p.amount} ${p.currencyCode} · received ${
          p.receivedAt ? format(p.receivedAt, 'dd MMM yyyy') : '—'
        }`,
        href: `/candidates/${id}/receipts/${p.receiptNumber}`,
      })),
    ...existingCreditNotes.map((c) => ({
      key: `cn-${c.id}`,
      label: `Credit note ${c.number}`,
      detail: `${c.amount} ${data.invoice.currencyCode} · issued ${format(c.issuedAt, 'dd MMM yyyy · HH:mm')}`,
      href: null,
    })),
    ...(data.invoice.sourceLeadId
      ? [
          {
            key: 'lead',
            label: 'Source lead',
            detail: 'The Candidate Services lead this invoice was raised from.',
            href: `/leads/${data.invoice.sourceLeadId}`,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background print:bg-white">
      {/* ── Breadcrumb + header card — Stage 6G Screen 10 ────────── */}
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 print:hidden">
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link href="/payments" className="hover:text-foreground hover:underline">
            Payments
          </Link>{' '}
          /{' '}
          <Link href={`/candidates/${id}`} className="hover:text-foreground hover:underline">
            Invoices
          </Link>{' '}
          / <span className="font-medium text-foreground">{data.invoice.number}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn('grid size-12 shrink-0 place-items-center rounded-xl', DS_SOFT.blue)}
            >
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-foreground">
                  Invoice <span className="text-sky-800">{data.invoice.number}</span>
                </h1>
                <DsStatusPill
                  tone={
                    isComplimentary && data.invoice.status !== 'VOIDED'
                      ? 'blue'
                      : data.invoice.status === 'PAID'
                        ? 'green'
                        : data.invoice.status === 'VOIDED'
                          ? 'slate'
                          : 'amber'
                  }
                >
                  {isComplimentary && data.invoice.status !== 'VOIDED'
                    ? 'Complimentary'
                    : (INVOICE_STATUS_LABEL[data.invoice.status] ?? data.invoice.status)}
                </DsStatusPill>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Issued on {format(data.invoice.issuedAt, 'dd MMM yyyy · HH:mm')}
              </p>
              {isComplimentary && data.invoice.complimentaryReason && (
                <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                  Complimentary — no payment due. Reason:{' '}
                  <span className="text-foreground">{data.invoice.complimentaryReason}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        <div className="mt-3 flex items-center justify-between">
          <Link
            href={`/candidates/${id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ArrowLeft className="mr-1.5 size-4" /> Back to candidate
          </Link>
        </div>
      </div>

      {/* Correction-path banner — invoices are immutable by design (Irish
          VAT rules + audit trail). This banner surfaces the two legal
          correction paths right at the top so staff don't go hunting for
          an Edit button that doesn't exist. */}
      {(canVoid || (canCredit && maxCreditCents > 0)) && (
        <div className="mx-auto mt-3 max-w-4xl px-4 sm:px-6 print:hidden">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs shadow-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            <strong className="font-semibold">Need to correct the amount?</strong>{' '}
            {isComplimentary
              ? 'Complimentary invoice — no money moved, so there is nothing to credit or refund. Void it above with a reason (the linked service is cancelled automatically) and re-issue if needed.'
              : data.invoice.status === 'ISSUED'
                ? "Nothing paid yet — Void the invoice above and generate a fresh one from the candidate's Billing tab."
                : "Issue a credit note above to reduce what's owed, then raise a second invoice from the candidate's Billing tab for the correct amount. Invoices are final once paid — this is required by Irish VAT rules."}
          </div>
        </div>
      )}

      <div className="mx-auto mt-4 max-w-4xl px-4 pb-10 sm:px-6 print:mt-0 print:max-w-none print:px-0 print:pb-0">
        <InvoiceDetailTabs
          payments={paymentTrail}
          related={relatedRecords}
          paymentReceivedNote={paymentReceivedNote}
        >
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
        </InvoiceDetailTabs>
      </div>
    </div>
  );
}
