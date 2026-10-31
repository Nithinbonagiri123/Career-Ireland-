import { Receipt } from 'lucide-react';
import { notFound } from 'next/navigation';
import { FinanceDocumentShell, ReceiptMeta } from '@/components/billing/finance-document-shell';
import { ReceiptPrintable } from '@/components/billing/receipt-printable';
import { DocumentHeader } from '@/components/ds/document-header';
import { formatMoney } from '@/components/ds/money';
import { PrintButton } from '@/components/print-button';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchReceiptForPrint } from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receipt' };

export default async function EmployerReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  await requireInternalStaff();
  const { id, number } = await params;
  const [data, settings] = await Promise.all([fetchReceiptForPrint(number), fetchAppSettings()]);
  if (data?.payer.kind !== 'EMPLOYER' || data.payer.employer.id !== id) notFound();

  const employer = data.payer.employer;
  const displayName = employer.tradingName
    ? `${employer.legalName} (t/a ${employer.tradingName})`
    : employer.legalName;
  const locationLine = [employer.city, employer.country].filter(Boolean).join(', ');
  const billingHref = `/employers/${id}?tab=billing`;
  // Link the invoice only when its page exists for this same payer.
  const invoiceHref =
    data.invoice && data.invoice.payerEmployerId === id
      ? `/employers/${id}/invoices/${data.invoice.number}`
      : null;

  return (
    <FinanceDocumentShell
      header={
        <DocumentHeader
          breadcrumbs={[
            { label: 'Employers', href: '/employers' },
            { label: employer.legalName, href: billingHref },
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
              payerName={displayName}
              amount={formatMoney(data.receipt.amount, data.receipt.currencyCode)}
              receivedAt={data.receipt.receivedAt}
              invoiceNumber={data.invoice?.number ?? null}
              invoiceHref={invoiceHref}
            />,
          ]}
          actions={<PrintButton />}
        />
      }
    >
      <ReceiptPrintable
        receipt={data.receipt}
        payment={data.payment}
        invoice={data.invoice}
        settings={settings}
        payer={{
          displayName,
          contactRows: [
            locationLine ? { label: 'Customer Location', value: locationLine } : null,
            employer.website ? { label: 'Customer Website', value: employer.website } : null,
          ].filter((r): r is { label: string; value: string } => r !== null),
        }}
      />
    </FinanceDocumentShell>
  );
}
