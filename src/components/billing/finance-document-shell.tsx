import { format } from 'date-fns';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Stage 6G layout shared by the invoice and receipt pages (candidate and
 * employer payers): header + correction note on top, the document below.
 *
 * Print output is the printable alone, edge to edge — every wrapper here
 * collapses to zero spacing under `print:` so a printed document is the
 * same whichever route it came from.
 */
export function FinanceDocumentShell({
  header,
  notice,
  children,
}: {
  /** Usually a <DocumentHeader>. Hidden when printing. */
  header: ReactNode;
  /** Optional correction note under the header. Hidden when printing. */
  notice?: ReactNode;
  /** The document (tabs + printable, or the printable alone). */
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background print:bg-white">
      <div className="mx-auto w-full max-w-4xl space-y-3 px-4 pt-6 sm:px-6 print:hidden">
        {header}
        {notice}
      </div>
      <div className="mx-auto mt-4 w-full min-w-0 max-w-4xl px-4 pb-10 sm:px-6 print:mt-0 print:max-w-none print:px-0 print:pb-0">
        {children}
      </div>
    </div>
  );
}

/** Shared by the candidate and employer receipt headers. */
export function ReceiptMeta({
  payerName,
  amount,
  receivedAt,
  invoiceNumber,
  invoiceHref,
}: {
  payerName: string;
  amount: string;
  receivedAt: Date;
  invoiceNumber: string | null;
  invoiceHref: string | null;
}) {
  return (
    <>
      Received from <span className="text-foreground">{payerName}</span> ·{' '}
      <span className="font-semibold tabular-nums text-foreground">{amount}</span> on{' '}
      <time dateTime={receivedAt.toISOString()}>{format(receivedAt, 'dd MMM yyyy · HH:mm')}</time>
      {invoiceNumber && (
        <>
          {' '}
          · Applied to{' '}
          {invoiceHref ? (
            <Link
              href={invoiceHref}
              aria-label={`Open invoice ${invoiceNumber}`}
              className="rounded-sm font-medium text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
            >
              {invoiceNumber}
            </Link>
          ) : (
            <span className="text-foreground">{invoiceNumber}</span>
          )}
        </>
      )}
    </>
  );
}
