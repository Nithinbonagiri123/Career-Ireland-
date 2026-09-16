import { format } from 'date-fns';
import { ArrowUpRight, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { statusTone } from '@/lib/ui/status-tone';
import type { PersonBillingRow, PersonReceiptRow } from '@/modules/billing/read';

/**
 * Billing history for a person profile — every invoice and receipt
 * attached via `payer_person_id`. Works whether the person is still a
 * lead or already a candidate; the tab is the one place staff can
 * return to see the paperwork they issued.
 */
export function PersonBillingSection({
  personId,
  invoices,
  receipts,
}: {
  personId: string;
  invoices: PersonBillingRow[];
  receipts: PersonReceiptRow[];
}) {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Invoices
          </h3>
          <span className="text-xs text-muted-foreground">
            {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
          </span>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Invoices issued to this person from the lead row, the onboarding flow, or the candidate page will appear here."
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {invoices.map(({ invoice, serviceName }) => (
              <li
                key={invoice.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-medium">{invoice.number}</p>
                    <Badge variant={statusTone(invoice.status)}>{invoice.status}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {invoice.qty} × {serviceName}
                    <span className="mx-1.5 text-muted-foreground/60">·</span>
                    {format(invoice.issuedAt, 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold">
                      {formatMoney(invoice.totalAmount, invoice.currencyCode)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Total (incl. VAT)
                    </p>
                  </div>
                  <Link
                    href={`/candidates/${personId}/invoices/${invoice.number}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Open
                    <ArrowUpRight className="ml-1 size-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Receipts
          </h3>
          <span className="text-xs text-muted-foreground">
            {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
          </span>
        </div>

        {receipts.length === 0 ? (
          <EmptyState
            icon={ReceiptIcon}
            title="No receipts yet"
            description="A receipt is auto-issued when a payment against an invoice is marked verified."
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {receipts.map(({ receipt, invoiceNumber }) => (
              <li
                key={receipt.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-mono text-sm font-medium">{receipt.number}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {invoiceNumber ? (
                      <>
                        Applied to <span className="font-mono">{invoiceNumber}</span>
                        <span className="mx-1.5 text-muted-foreground/60">·</span>
                      </>
                    ) : null}
                    {format(receipt.receivedAt, 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold text-status-success">
                      {formatMoney(receipt.amount, receipt.currencyCode)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Received
                    </p>
                  </div>
                  <Link
                    href={`/candidates/${personId}/receipts/${receipt.number}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Open
                    <ArrowUpRight className="ml-1 size-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();
function formatMoney(amount: string, currency: string): string {
  let fmt = currencyFormatters.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      fmt = new Intl.NumberFormat('en-IE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    currencyFormatters.set(currency, fmt);
  }
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  return fmt.format(n);
}
