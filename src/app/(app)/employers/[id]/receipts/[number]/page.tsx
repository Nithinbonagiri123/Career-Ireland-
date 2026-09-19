import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReceiptPrintable } from '@/components/billing/receipt-printable';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
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

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6 print:hidden">
        <Link
          href={`/employers/${id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back to employer
        </Link>
        <PrintButton />
      </div>

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
    </div>
  );
}
