import { format } from 'date-fns';
import { ArrowLeft, Printer } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { COMPANY_INFO } from '@/modules/billing/company-info';
import { fetchInvoiceForPrint } from '@/modules/billing/read';
import { VoidInvoiceControls } from './void-invoice-controls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoice · Ireland Career Gateway' };

/**
 * Print-friendly invoice page. `⌘P` gives a clean 1-page PDF via the
 * browser's Save-as-PDF. Controls at the top (Back, Print) are hidden
 * in the print stylesheet.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string; number: string }>;
}) {
  const session = await requireInternalStaff();
  const { id, number } = await params;
  const data = await fetchInvoiceForPrint(number);
  if (!data || data.payer.id !== id) notFound();

  const { invoice, payer, catalogItem } = data;
  const canVoid = session.user.role === 'ADMIN' && invoice.status === 'ISSUED';
  const isVoided = invoice.status === 'VOIDED';

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
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              personId={id}
            />
          )}
          <PrintButton />
        </div>
      </div>

      <main className="relative mx-auto my-6 max-w-3xl bg-white p-10 shadow-sm print:my-0 print:max-w-none print:shadow-none">
        {isVoided && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="rotate-[-18deg] rounded-md border-8 border-destructive/50 px-8 py-3 text-6xl font-black uppercase tracking-widest text-destructive/50">
              Voided
            </span>
          </div>
        )}
        <header className="flex items-start justify-between border-b pb-6">
          <div>
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
                {COMPANY_INFO.registrationNumber && (
                  <div className="text-xs text-muted-foreground">
                    Reg. no. {COMPANY_INFO.registrationNumber}
                  </div>
                )}
                {COMPANY_INFO.vatNumber && (
                  <div className="text-xs text-muted-foreground">VAT {COMPANY_INFO.vatNumber}</div>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Invoice</div>
            <div className="mt-1 font-mono text-lg font-semibold">{invoice.number}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Issued {format(invoice.issuedAt, 'dd MMM yyyy')}
            </div>
            <div
              className={
                isVoided
                  ? 'mt-1 text-xs font-semibold uppercase tracking-widest text-destructive'
                  : 'text-xs text-muted-foreground'
              }
            >
              Status: {invoice.status}
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Bill to</div>
            <div className="mt-1 font-medium">
              {payer.firstName} {payer.lastName}
            </div>
            {payer.email && <div className="text-xs">{payer.email}</div>}
            {payer.phone && <div className="text-xs">{payer.phone}</div>}
            {payer.currentCity && (
              <div className="text-xs">
                {payer.currentCity}
                {payer.currentCountry ? `, ${payer.currentCountry}` : ''}
              </div>
            )}
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3">
                {invoice.lineDescription}
                <div className="mt-1 text-xs text-muted-foreground">{catalogItem.name}</div>
              </td>
              <td className="py-3 text-right font-mono">
                {invoice.subtotal} {invoice.currencyCode}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-2 text-right text-xs text-muted-foreground">Subtotal</td>
              <td className="py-2 text-right font-mono">
                {invoice.subtotal} {invoice.currencyCode}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-right text-xs text-muted-foreground">Tax</td>
              <td className="py-2 text-right font-mono">
                {invoice.taxAmount} {invoice.currencyCode}
              </td>
            </tr>
            <tr className="border-t">
              <td className="py-3 text-right text-sm font-semibold">Total</td>
              <td className="py-3 text-right font-mono text-base font-semibold">
                {invoice.totalAmount} {invoice.currencyCode}
              </td>
            </tr>
          </tfoot>
        </table>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          {isVoided ? (
            <>
              <div className="font-semibold text-destructive">
                Voided on {invoice.voidedAt ? format(invoice.voidedAt, 'dd MMM yyyy, HH:mm') : '—'}
              </div>
              {invoice.voidReason && <div className="mt-1">Reason: {invoice.voidReason}</div>}
            </>
          ) : (
            <>
              Thank you for choosing Career Ireland.
              {COMPANY_INFO.contactEmail && ` Questions? Email ${COMPANY_INFO.contactEmail}.`}
            </>
          )}
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
