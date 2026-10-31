import { format } from 'date-fns';
import { FileText } from 'lucide-react';
import { notFound } from 'next/navigation';
import { FinanceDocumentShell } from '@/components/billing/finance-document-shell';
import {
  InvoiceDetailTabs,
  type RelatedRecordLink,
} from '@/components/billing/invoice-detail-tabs';
import { InvoicePrintable } from '@/components/billing/invoice-printable';
import { IssueRefundControls } from '@/components/billing/issue-refund-controls';
import { CorrectionBanner } from '@/components/ds/correction-banner';
import { DocumentHeader } from '@/components/ds/document-header';
import { FinanceStatusPill } from '@/components/ds/finance-status';
import { formatMoney } from '@/components/ds/money';
import { PrintButton } from '@/components/print-button';
import { requireInternalStaff } from '@/lib/auth/session';
import {
  fetchCreditNotesForInvoice,
  fetchInvoiceForPrint,
  fetchInvoicePaymentTrail,
  fetchRefundablePaymentsForInvoice,
} from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';
import { CreditNoteControls } from '../../../../candidates/[id]/invoices/[number]/credit-note-controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoice' };

/**
 * Employer-scoped invoice page. Refuses when the invoice was actually
 * person-paid. Same Stage 6G document layout and printable as the
 * candidate route; the controls and their gating are unchanged (no Void
 * on employer invoices).
 */
export default async function EmployerInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  const session = await requireInternalStaff();
  const { id, number } = await params;
  const [data, settings] = await Promise.all([fetchInvoiceForPrint(number), fetchAppSettings()]);
  if (data?.payer.kind !== 'EMPLOYER' || data.payer.employer.id !== id) notFound();

  const employer = data.payer.employer;
  const displayName = employer.tradingName
    ? `${employer.legalName} (t/a ${employer.tradingName})`
    : employer.legalName;
  const locationLine = [employer.city, employer.country].filter(Boolean).join(', ');
  const billingHref = `/employers/${id}?tab=billing`;
  const canCredit =
    (session.user.role === 'ADMIN' || session.user.role === 'FINANCE') &&
    data.invoice.status !== 'VOIDED';

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

  // Read-only payment trail for the Payments / Related records tabs.
  const paymentTrail = await fetchInvoicePaymentTrail(data.invoice.id);
  const latestPaid = paymentTrail.find((p) => p.status === 'VERIFIED');
  const paymentReceivedNote =
    data.invoice.status === 'PAID' && latestPaid
      ? `This invoice has been fully paid. Payment was received on ${format(
          latestPaid.receivedAt ?? latestPaid.createdAt,
          'dd MMM yyyy · HH:mm',
        )} via ${latestPaid.method.replace(/_/g, ' ').toLowerCase()}${
          latestPaid.proofReference ? ` (Ref: ${latestPaid.proofReference})` : ''
        }.`
      : null;
  const relatedRecords: RelatedRecordLink[] = [
    {
      key: 'employer',
      label: 'Employer workspace',
      detail: displayName,
      href: billingHref,
      icon: 'employer',
    },
    ...paymentTrail
      .filter((p) => p.receiptNumber)
      .map((p) => ({
        key: `receipt-${p.id}`,
        label: `Receipt ${p.receiptNumber}`,
        detail: `${formatMoney(p.amount, p.currencyCode)} · received ${
          p.receivedAt ? format(p.receivedAt, 'dd MMM yyyy · HH:mm') : '—'
        }`,
        href: `/employers/${id}/receipts/${p.receiptNumber}`,
      })),
    ...existingCreditNotes.map((c) => ({
      key: `cn-${c.id}`,
      label: `Credit note ${c.number}`,
      detail: `${formatMoney(c.amount, data.invoice.currencyCode)} · issued ${format(c.issuedAt, 'dd MMM yyyy · HH:mm')}`,
      href: null,
    })),
  ];

  return (
    <FinanceDocumentShell
      header={
        <DocumentHeader
          breadcrumbs={[
            { label: 'Employers', href: '/employers' },
            { label: employer.legalName, href: billingHref },
            { label: data.invoice.number },
          ]}
          back={{ href: billingHref, label: 'Back to billing' }}
          icon={FileText}
          kind="Invoice"
          number={data.invoice.number}
          status={<FinanceStatusPill kind="invoice" status={data.invoice.status} />}
          issuedAt={data.invoice.issuedAt}
          meta={[
            <>
              Billed to <span className="text-foreground">{displayName}</span> ·{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(data.invoice.totalAmount, data.invoice.currencyCode)}
              </span>
            </>,
          ]}
          actions={
            <>
              {canCredit && maxCreditCents > 0 && (
                <CreditNoteControls
                  invoiceId={data.invoice.id}
                  invoiceNumber={data.invoice.number}
                  profileHref={`/employers/${id}`}
                  currencyCode={data.invoice.currencyCode}
                  maxCreditAmount={maxCreditAmount}
                />
              )}
              {refundablePayments.length > 0 && (
                <IssueRefundControls
                  invoiceNumber={data.invoice.number}
                  profileHref={`/employers/${id}`}
                  refundablePayments={refundablePayments}
                />
              )}
              <PrintButton />
            </>
          }
        />
      }
      notice={
        canCredit &&
        maxCreditCents > 0 && (
          <CorrectionBanner>
            Issue a credit note above to reduce what&apos;s owed, then raise a second invoice from
            the employer&apos;s Billing section for the correct amount. Invoices are final once paid
            — this is required by Irish VAT rules.
          </CorrectionBanner>
        )
      }
    >
      <InvoiceDetailTabs
        payments={paymentTrail}
        related={relatedRecords}
        paymentReceivedNote={paymentReceivedNote}
        receiptBase={`/employers/${id}/receipts`}
      >
        <InvoicePrintable
          invoice={data.invoice}
          settings={settings}
          payer={{
            displayName,
            // Employer schema has no billing email/phone. Surface what
            // we do have with truthful labels so the customer doesn't
            // see "Customer Email: Sligo, Ireland".
            contactRows: [
              locationLine ? { label: 'Customer Location', value: locationLine } : null,
              employer.website ? { label: 'Customer Website', value: employer.website } : null,
            ].filter((r): r is { label: string; value: string } => r !== null),
          }}
          lineItems={data.lineItems}
          creditNotes={existingCreditNotes}
        />
      </InvoiceDetailTabs>
    </FinanceDocumentShell>
  );
}
