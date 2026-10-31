import { format } from 'date-fns';
import { ArrowUpRight, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '@/components/ds/money';
import { DsEnumPill, DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { DS_ROW_LIST } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  invoiceHref,
  receiptHref,
}: {
  profileHref: string;
  invoices: PersonBillingRow[];
  receipts: PersonReceiptRow[];
  canVerify: boolean;
  /**
   * Optional per-row destination (e.g. a case whose invoices can be paid by
   * a person or an employer). Return null when no verified page exists and
   * the row is shown without an Open link. Defaults to `profileHref`.
   */
  invoiceHref?: (invoice: PersonBillingRow['invoice']) => string | null;
  receiptHref?: (receipt: PersonReceiptRow['receipt']) => string | null;
}) {
  const hrefForInvoice = (invoice: PersonBillingRow['invoice']) =>
    invoiceHref ? invoiceHref(invoice) : `${profileHref}/invoices/${invoice.number}`;
  const hrefForReceipt = (receipt: PersonReceiptRow['receipt']) =>
    receiptHref ? receiptHref(receipt) : `${profileHref}/receipts/${receipt.number}`;
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="size-4 text-primary" aria-hidden />
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
          <ul className={DS_ROW_LIST}>
            {invoices.map(
              ({ invoice, serviceName, paidAmount, outstandingAmount, creditedAmount }) => {
                const overdue = isInvoiceOverdue(invoice);
                const paidFloat = Number.parseFloat(paidAmount);
                const outstandingFloat = Number.parseFloat(outstandingAmount);
                const creditedFloat = Number.parseFloat(creditedAmount);
                const acceptsMorePayments =
                  invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID';
                return (
                  <li
                    key={invoice.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
                          DS_SOFT[overdue ? 'rose' : 'blue'],
                        )}
                      >
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-semibold">{invoice.number}</p>
                          <DsEnumPill status={invoice.status} />
                          {overdue && (
                            <span title={`Unpaid for ${OVERDUE_THRESHOLD_DAYS}+ days since issued`}>
                              <DsStatusPill tone="rose">Overdue</DsStatusPill>
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {invoice.qty} × {serviceName}
                          <span className="mx-1.5 text-muted-foreground/60">·</span>
                          {format(invoice.issuedAt, 'dd MMM yyyy · HH:mm')}
                        </p>
                        {(paidFloat > 0 || creditedFloat > 0) && invoice.status !== 'VOIDED' && (
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                            <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                              {formatMoney(paidAmount, invoice.currencyCode)} paid
                            </span>
                            {creditedFloat > 0 && (
                              <span className="tabular-nums text-muted-foreground">
                                {formatMoney(creditedAmount, invoice.currencyCode)} credited
                              </span>
                            )}
                            {outstandingFloat > 0 ? (
                              <span className="tabular-nums font-medium text-amber-700 dark:text-amber-300">
                                {formatMoney(outstandingAmount, invoice.currencyCode)} outstanding
                              </span>
                            ) : (
                              <span className="tabular-nums text-muted-foreground">Settled</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:justify-end">
                      <div className="mr-auto text-left sm:mr-0 sm:text-right">
                        <p className="tabular-nums text-sm font-semibold">
                          {formatMoney(invoice.totalAmount, invoice.currencyCode)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {Number.parseFloat(invoice.taxAmount) > 0 ? 'Total (incl. VAT)' : 'Total'}
                        </p>
                      </div>
                      {acceptsMorePayments && (
                        <RecordInvoicePaymentDialog
                          invoice={{
                            id: invoice.id,
                            number: invoice.number,
                            serviceEngagementId: invoice.serviceEngagementId,
                            totalAmount: invoice.totalAmount,
                            currencyCode: invoice.currencyCode,
                            outstandingAmount,
                          }}
                          canVerify={canVerify}
                        />
                      )}
                      {hrefForInvoice(invoice) && (
                        <Link
                          href={hrefForInvoice(invoice) as string}
                          aria-label={`Open invoice ${invoice.number}`}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Open
                          <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              },
            )}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ReceiptIcon className="size-4 text-primary" aria-hidden />
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
          <ul className={DS_ROW_LIST}>
            {receipts.map(({ receipt, invoiceNumber }) => (
              <li
                key={receipt.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
                      DS_SOFT.green,
                    )}
                  >
                    <ReceiptIcon className="size-4" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="font-mono text-sm font-semibold">{receipt.number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {invoiceNumber ? (
                        <>
                          Applied to <span className="font-mono">{invoiceNumber}</span>
                          <span className="mx-1.5 text-muted-foreground/60">·</span>
                        </>
                      ) : null}
                      {format(receipt.receivedAt, 'dd MMM yyyy · HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="mr-auto text-left sm:mr-0 sm:text-right">
                    <p className="tabular-nums text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatMoney(receipt.amount, receipt.currencyCode)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Received</p>
                  </div>
                  {hrefForReceipt(receipt) && (
                    <Link
                      href={hrefForReceipt(receipt) as string}
                      aria-label={`Open receipt ${receipt.number}`}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      Open
                      <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
