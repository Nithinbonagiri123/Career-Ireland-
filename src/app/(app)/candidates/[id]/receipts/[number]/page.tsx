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

  const relatedInvoiceVoided = data.invoice?.status === 'VOIDED';

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6 print:hidden">
        <Link
          href={`/candidates/${id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back to candidate
        </Link>
        <PrintButton />
      </div>

      {/* Correction-path banner — receipts are immutable by design, same
          as invoices. Mirrors the invoice page's amber banner so staff
          don't go hunting for an Edit button that doesn't exist, and
          flags the orphan case where the underlying invoice was voided
          after the receipt was issued. */}
      <div className="mx-auto mt-3 max-w-3xl px-6 print:hidden">
        <div className="rounded-md border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <strong className="font-semibold">Need to correct this payment?</strong>{' '}
          {relatedInvoiceVoided
            ? "The invoice tied to this receipt has been voided. Issue a refund to the payer if the money was returned, then raise a fresh invoice from the candidate's Billing tab."
            : "Receipts are final once issued. If the amount or date is wrong, void the related invoice first, then raise a fresh invoice from the candidate's Billing tab."}
        </div>
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
