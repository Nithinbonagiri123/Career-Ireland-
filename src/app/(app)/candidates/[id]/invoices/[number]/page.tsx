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
import { DsStatusPill } from '@/components/ds/status-pill';
import { PrintButton } from '@/components/print-button';
import { requireInternalStaff } from '@/lib/auth/session';
import {
  fetchCreditNotesForInvoice,
  fetchInvoiceForPrint,
  fetchInvoicePaymentTrail,
  fetchRefundablePaymentsForInvoice,
} from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';
import { CreditNoteControls } from './credit-note-controls';
import { VoidInvoiceControls } from './void-invoice-controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoice' };

/**
 * Person-scoped invoice page. Refuses when the invoice is actually
 * employer-paid (URL narrowing) or when the person doesn't match.
 * Stage 6G document layout; the printable itself is shared with the
 * employer route so both print identically.
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
  const personName = `${person.firstName} ${person.lastName}`.trim();
  const billingHref = `/clients/${id}?tab=services-billing`;
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
          'dd MMM yyyy · HH:mm',
        )} via ${latestPaid.method.replace(/_/g, ' ').toLowerCase()}${
          latestPaid.proofReference ? ` (Ref: ${latestPaid.proofReference})` : ''
        }.`
      : null;
  const relatedRecords: RelatedRecordLink[] = [
    {
      key: 'candidate',
      label: 'Candidate workspace',
      detail: personName,
      href: billingHref,
      icon: 'person',
    },
    ...paymentTrail
      .filter((p) => p.receiptNumber)
      .map((p) => ({
        key: `receipt-${p.id}`,
        label: `Receipt ${p.receiptNumber}`,
        detail: `${formatMoney(p.amount, p.currencyCode)} · received ${
          p.receivedAt ? format(p.receivedAt, 'dd MMM yyyy · HH:mm') : '—'
        }`,
        href: `/candidates/${id}/receipts/${p.receiptNumber}`,
      })),
    ...existingCreditNotes.map((c) => ({
      key: `cn-${c.id}`,
      label: `Credit note ${c.number}`,
      detail: `${formatMoney(c.amount, data.invoice.currencyCode)} · issued ${format(c.issuedAt, 'dd MMM yyyy · HH:mm')}`,
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

  const showComplimentary = isComplimentary && data.invoice.status !== 'VOIDED';

  return (
    <FinanceDocumentShell
      header={
        <DocumentHeader
          breadcrumbs={[
            { label: 'Payments', href: '/payments' },
            { label: personName || 'Candidate', href: billingHref },
            { label: data.invoice.number },
          ]}
          back={{ href: billingHref, label: 'Back to billing' }}
          icon={FileText}
          kind="Invoice"
          number={data.invoice.number}
          status={
            showComplimentary ? (
              <DsStatusPill tone="blue">Complimentary</DsStatusPill>
            ) : (
              <FinanceStatusPill kind="invoice" status={data.invoice.status} />
            )
          }
          issuedAt={data.invoice.issuedAt}
          meta={[
            <>
              Billed to <span className="text-foreground">{personName}</span> ·{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(data.invoice.totalAmount, data.invoice.currencyCode)}
              </span>
            </>,
            ...(isComplimentary && data.invoice.complimentaryReason
              ? [
                  <>
                    Complimentary — no payment due. Reason:{' '}
                    <span className="text-foreground">{data.invoice.complimentaryReason}</span>
                  </>,
                ]
              : []),
          ]}
          actions={
            <>
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
            </>
          }
        />
      }
      notice={
        // Invoices are immutable by design (Irish VAT rules + audit
        // trail): surface the two legal correction paths up front.
        (canVoid || (canCredit && maxCreditCents > 0)) && (
          <CorrectionBanner>
            {isComplimentary
              ? 'Complimentary invoice — no money moved, so there is nothing to credit or refund. Void it above with a reason (the linked service is cancelled automatically) and re-issue if needed.'
              : data.invoice.status === 'ISSUED'
                ? "Nothing paid yet — Void the invoice above and generate a fresh one from the candidate's Billing tab."
                : "Issue a credit note above to reduce what's owed, then raise a second invoice from the candidate's Billing tab for the correct amount. Invoices are final once paid — this is required by Irish VAT rules."}
          </CorrectionBanner>
        )
      }
    >
      <InvoiceDetailTabs
        payments={paymentTrail}
        related={relatedRecords}
        paymentReceivedNote={paymentReceivedNote}
        receiptBase={`/candidates/${id}/receipts`}
      >
        <InvoicePrintable
          invoice={data.invoice}
          settings={settings}
          payer={{
            displayName: personName,
            contactRows: [
              person.email ? { label: 'Customer Email', value: person.email } : null,
              person.phone ? { label: 'Customer Telephone Contact', value: person.phone } : null,
            ].filter((r): r is { label: string; value: string } => r !== null),
          }}
          lineItems={data.lineItems}
          creditNotes={existingCreditNotes}
        />
      </InvoiceDetailTabs>
    </FinanceDocumentShell>
  );
}
