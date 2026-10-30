'use client';

import { format } from 'date-fns';
import { CheckCircle2, ExternalLink, FileText, Receipt, UserRound } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { arrowKeyNav } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { InvoicePaymentTrailRow } from '@/modules/billing/read';

/**
 * Stage 6G Screen 10 — Overview / Payments / Related records tabs on
 * the invoice detail page. The Overview tab hosts the server-rendered
 * printable document (passed as children so printing is unchanged);
 * the other two tabs are read-only views over the same billing data.
 */

const PAYMENT_LABEL: Record<InvoicePaymentTrailRow['status'], string> = {
  PENDING: 'Pending',
  PROOF_UPLOADED: 'Pending',
  VERIFIED: 'Paid',
  REJECTED: 'Rejected',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

export type RelatedRecordLink = {
  key: string;
  label: string;
  detail: string;
  href: string | null;
};

export function InvoiceDetailTabs({
  payments,
  related,
  paymentReceivedNote,
  children,
}: {
  payments: InvoicePaymentTrailRow[];
  related: RelatedRecordLink[];
  /** Green success banner text when the invoice is fully paid. */
  paymentReceivedNote: string | null;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<'overview' | 'payments' | 'related'>('overview');

  const tabs = [
    { value: 'overview' as const, label: 'Overview' },
    { value: 'payments' as const, label: `Payments (${payments.length})` },
    { value: 'related' as const, label: 'Related records' },
  ];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Invoice sections"
        onKeyDown={(e) => arrowKeyNav(e)}
        className="flex gap-0 overflow-x-auto rounded-2xl border border-border/60 bg-card px-2 shadow-sm print:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'relative h-12 shrink-0 px-3.5 text-sm font-medium transition-colors sm:px-4',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:content-['']",
              tab === t.value
                ? 'font-semibold text-foreground after:bg-primary'
                : 'text-muted-foreground after:bg-transparent hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview — always rendered so printing keeps working; hidden
          from view (not from print) when another tab is active. */}
      <div className={cn(tab !== 'overview' && 'hidden print:block')}>
        {children}
        {paymentReceivedNote && (
          <div className="mt-4 pb-8 print:hidden">
            <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/40">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden />
              <div className="text-xs text-foreground/90">
                <p className="font-semibold text-foreground">Payment received</p>
                <p className="mt-0.5">{paymentReceivedNote}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {tab === 'payments' && (
        <div className="mt-4 pb-8 print:hidden">
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            {payments.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No payments recorded against this invoice&apos;s service yet.
              </p>
            ) : (
              <ul className="divide-y">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-xl',
                        DS_SOFT.green,
                      )}
                    >
                      <Receipt className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(p.amount, p.currencyCode)}
                        <DsStatusPill tone="green" className="ml-2 align-middle">
                          {PAYMENT_LABEL[p.status]}
                        </DsStatusPill>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.method.replace(/_/g, ' ')}
                        {p.proofReference && ` · ref ${p.proofReference}`}
                        {p.receivedAt && ` · received ${format(p.receivedAt, 'dd MMM yyyy')}`} ·
                        recorded {format(p.createdAt, 'dd MMM yyyy · HH:mm')}
                      </p>
                    </div>
                    {p.receiptNumber && (
                      <span className="shrink-0 text-xs font-medium text-sky-700">
                        {p.receiptNumber}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'related' && (
        <div className="mt-4 pb-8 print:hidden">
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <ul className="divide-y">
              {related.map((r) => (
                <li key={r.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl',
                      DS_SOFT.blue,
                    )}
                  >
                    {r.label.toLowerCase().includes('candidate') ? (
                      <UserRound className="size-4" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{r.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.detail}</p>
                  </div>
                  {r.href && (
                    <Link
                      href={r.href}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
                    >
                      Open <ExternalLink className="size-3" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
