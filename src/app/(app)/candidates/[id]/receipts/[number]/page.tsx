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

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6 print:hidden">
        <Link
          href={`/candidates/${id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back to candidate
        </Link>
        <PrintButton />
      </div>

      <ReceiptPrintable
        receipt={data.receipt}
        payment={data.payment}
        invoice={data.invoice}
        settings={settings}
        payer={{
          displayName: `${person.firstName} ${person.lastName}`.trim(),
          contactRows: [
            person.email ? { label: 'Customer Email', value: person.email } : null,
            person.phone ? { label: 'Customer Telephone Contact', value: person.phone } : null,
          ].filter((r): r is { label: string; value: string } => r !== null),
        }}
      />
    </div>
  );
}
