import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoicePrintable } from '@/components/billing/invoice-printable';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchInvoiceForPrint } from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoice' };

/**
 * Employer-scoped printable invoice. Refuses when the invoice was
 * actually person-paid. Renders the shared `<InvoicePrintable>` with
 * employer identity.
 */
export default async function EmployerInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  await requireInternalStaff();
  const { id, number } = await params;
  const [data, settings] = await Promise.all([fetchInvoiceForPrint(number), fetchAppSettings()]);
  if (data?.payer.kind !== 'EMPLOYER' || data.payer.employer.id !== id) notFound();

  const employer = data.payer.employer;
  const displayName = employer.tradingName
    ? `${employer.legalName} (t/a ${employer.tradingName})`
    : employer.legalName;
  const locationLine = [employer.city, employer.country].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6 print:hidden">
        <Link
          href={`/employers/${id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back to employer
        </Link>
        <PrintButton />
      </div>

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
      />
    </div>
  );
}
