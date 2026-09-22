import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoicePrintable } from '@/components/billing/invoice-printable';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchInvoiceForPrint } from '@/modules/billing/read';
import { fetchAppSettings } from '@/modules/settings/service';
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
          <PrintButton />
        </div>
      </div>

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
      />
    </div>
  );
}
