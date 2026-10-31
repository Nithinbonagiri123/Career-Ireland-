import { Receipt } from 'lucide-react';
import { notFound } from 'next/navigation';
import { FinanceDocumentShell, ReceiptMeta } from '@/components/billing/finance-document-shell';
import { ReceiptPrintable } from '@/components/billing/receipt-printable';
import { CorrectionBanner } from '@/components/ds/correction-banner';
import { DocumentHeader } from '@/components/ds/document-header';
import { formatMoney } from '@/components/ds/money';
import { PrintButton } from '@/components/print-button';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchReceiptForPrint } from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receipt' };

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  await requireInternalStaff();
  const { id, number } = await params;
  const [data, settings] = await Promise.all([fetchReceiptForPrint(number), fetchAppSettings()]);
  if (data?.payer.kind !== 'PERSON' || data.payer.person.id !== id) notFound();

  const person = data.payer.person;
  const personName = `${person.firstName} ${person.lastName}`.trim();
  const billingHref = `/clients/${id}?tab=services-billing`;
  const relatedInvoiceVoided = data.invoice?.status === 'VOIDED';
  // Link the invoice only when its page exists for this same payer.
  const invoiceHref =
    data.invoice && data.invoice.payerPersonId === id
      ? `/candidates/${id}/invoices/${data.invoice.number}`
      : null;

  return (
    <FinanceDocumentShell
      header={
        <DocumentHeader
          breadcrumbs={[
            { label: 'Payments', href: '/payments' },
            { label: personName || 'Candidate', href: billingHref },
            { label: data.receipt.number },
          ]}
          back={{ href: billingHref, label: 'Back to billing' }}
          icon={Receipt}
          tone="green"
          kind="Receipt"
          number={data.receipt.number}
          issuedAt={data.receipt.issuedAt}
          meta={[
            <ReceiptMeta
              key="m"
              payerName={personName}
              amount={formatMoney(data.receipt.amount, data.receipt.currencyCode)}
              receivedAt={data.receipt.receivedAt}
              invoiceNumber={data.invoice?.number ?? null}
              invoiceHref={invoiceHref}
            />,
          ]}
          actions={<PrintButton />}
        />
      }
      notice={
        // Receipts are immutable by design, same as invoices; also flags
        // the case where the underlying invoice was voided afterwards.
        <CorrectionBanner title="Need to correct this payment?">
          {relatedInvoiceVoided
            ? "The invoice tied to this receipt has been voided. Issue a refund to the payer if the money was returned, then raise a fresh invoice from the candidate's Billing tab."
            : "Receipts are final once issued. If the amount or date is wrong, void the related invoice first, then raise a fresh invoice from the candidate's Billing tab."}
        </CorrectionBanner>
      }
    >
      <ReceiptPrintable
        receipt={data.receipt}
        payment={data.payment}
        invoice={data.invoice}
        settings={settings}
        payer={{
          displayName: personName,
          contactRows: [
            person.email ? { label: 'Customer Email', value: person.email } : null,
            person.phone ? { label: 'Customer Telephone Contact', value: person.phone } : null,
          ].filter((r): r is { label: string; value: string } => r !== null),
        }}
      />
    </FinanceDocumentShell>
  );
}
