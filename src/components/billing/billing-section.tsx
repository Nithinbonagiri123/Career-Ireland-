import { format } from 'date-fns';
import { ArrowUpRight, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { statusTone } from '@/lib/ui/status-tone';
import { isInvoiceOverdue, OVERDUE_THRESHOLD_DAYS } from '@/modules/billing/aging';
import type { PersonBillingRow, PersonReceiptRow } from '@/modules/billing/read';
import { RecordInvoicePaymentDialog } from './record-invoice-payment-dialog';

/**
 * Billing history surface, shared by the person profile (Billing tab)
 * and the employer profile (Billing card). The rows are payer-agnostic —
 * caller passes the profile href so "Open" links resolve to the right
 * scoped print page:
 *   - candidates:  `/candidates/[id]`  → `/candidates/[id]/invoices/…`
 *   - employers:   `/employers/[id]`   → `/employers/[id]/invoices/…`
 *
 * `canVerify` gates the "Record + verify now" checkbox in the record-
 * payment dialog. Any internal staff can record a PENDING payment;
 * only ADMIN + FINANCE can flip to VERIFIED (matches server-side auth
 * on verifyPayment).
 */
export function BillingSection({
  profileHref,
  invoices,
  receipts,
  canVerify,
}: {
  profileHref: string;
  invoices: PersonBillingRow[];
  receipts: PersonReceiptRow[];
  canVerify: boolean;
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
            description="Invoices issued to this payer will appear here."
          />
        ) : (
          <ul className="divide-y rounded-lg glass-panel">
            {invoices.map(({ invoice, serviceName }) => {
              const overdue = isInvoiceOverdue(invoice);
              return (
                <li
                  key={invoice.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-medium">{invoice.number}</p>
                      <Badge variant={statusTone(invoice.status)}>{invoice.status}</Badge>
                      {overdue && (
                        <Badge
                          variant="danger"
                          title={`Unpaid for ${OVERDUE_THRESHOLD_DAYS}+ days since issued`}
                        >
                          OVERDUE
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {invoice.qty} × {serviceName}
                      <span className="mx-1.5 text-muted-foreground/60">·</span>
                      {format(invoice.issuedAt, 'dd MMM yyyy · HH:mm')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="tabular-nums text-sm font-semibold">
                        {formatCurrency(invoice.totalAmount, invoice.currencyCode)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Total (incl. VAT)
                      </p>
                    </div>
                    {invoice.status === 'ISSUED' && (
                      <RecordInvoicePaymentDialog
                        invoice={{
                          id: invoice.id,
                          number: invoice.number,
                          serviceEngagementId: invoice.serviceEngagementId,
                          totalAmount: invoice.totalAmount,
                          currencyCode: invoice.currencyCode,
                        }}
                        canVerify={canVerify}
                      />
                    )}
                    <Link
                      href={`${profileHref}/invoices/${invoice.number}`}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Open
                      <ArrowUpRight className="ml-1 size-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
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
          <ul className="divide-y rounded-lg glass-panel">
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
                    {format(receipt.receivedAt, 'dd MMM yyyy · HH:mm')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold text-status-success">
                      {formatCurrency(receipt.amount, receipt.currencyCode)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Received
                    </p>
                  </div>
                  <Link
                    href={`${profileHref}/receipts/${receipt.number}`}
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
