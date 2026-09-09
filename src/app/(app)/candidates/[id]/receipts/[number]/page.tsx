import { format } from 'date-fns';
import { ArrowLeft, Printer } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { COMPANY_INFO } from '@/modules/billing/company-info';
import { fetchReceiptForPrint } from '@/modules/billing/read';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Receipt · Ireland Career Gateway' };

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  await requireInternalStaff();
  const { id, number } = await params;
  const data = await fetchReceiptForPrint(number);
  if (!data || data.payer.id !== id) notFound();

  const { receipt, payer, payment, invoice } = data;

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

      <main className="mx-auto my-6 max-w-3xl bg-white p-10 shadow-sm print:my-0 print:max-w-none print:shadow-none">
        <header className="flex items-start justify-between border-b pb-6">
          <div className="flex items-start gap-3">
            <Image
              src="/logo.png"
              alt={COMPANY_INFO.legalName}
              width={848}
              height={1200}
              priority
              className="h-20 w-auto object-contain"
            />
            <div>
              <div className="text-sm font-semibold">{COMPANY_INFO.legalName}</div>
              {COMPANY_INFO.addressLines.map((line) => (
                <div key={line} className="text-xs text-muted-foreground">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Receipt</div>
            <div className="mt-1 font-mono text-lg font-semibold">{receipt.number}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Issued {format(receipt.issuedAt, 'dd MMM yyyy')}
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Received from
            </div>
            <div className="mt-1 font-medium">
              {payer.firstName} {payer.lastName}
            </div>
            {payer.email && <div className="text-xs">{payer.email}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Received on
            </div>
            <div className="mt-1">{format(receipt.receivedAt, 'dd MMM yyyy')}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Method: {payment.method.replace('_', ' ')}
            </div>
            {payment.proofReference && (
              <div className="text-xs text-muted-foreground">Ref: {payment.proofReference}</div>
            )}
          </div>
        </section>

        <div className="mt-10 flex items-center justify-between rounded-md bg-muted/40 px-6 py-6">
          <div className="text-sm text-muted-foreground">Amount received</div>
          <div className="font-mono text-2xl font-semibold">
            {receipt.amount} {receipt.currencyCode}
          </div>
        </div>

        {invoice && (
          <p className="mt-4 text-xs text-muted-foreground">
            Applied to invoice <span className="font-mono">{invoice.number}</span>.
          </p>
        )}

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          This receipt confirms the payment above has been received in full.
          {COMPANY_INFO.contactEmail && ` Questions? Email ${COMPANY_INFO.contactEmail}.`}
        </footer>
      </main>
    </div>
  );
}

function PrintButton() {
  return (
    <>
      <button type="button" data-print className={buttonVariants({ size: 'sm' })}>
        <Printer className="mr-1.5 size-4" /> Print / Save as PDF
      </button>
      <script
        // biome-ignore lint/security/noDangerouslySetInnerHtml: one-liner, no user input
        dangerouslySetInnerHTML={{
          __html: `document.querySelectorAll('[data-print]').forEach(b=>b.addEventListener('click',()=>window.print()))`,
        }}
      />
    </>
  );
}
