'use client';

import { format } from 'date-fns';
import { Building2, CheckCircle2, ExternalLink, FileText, Receipt, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type KeyboardEvent, type ReactNode, useId } from 'react';
import { formatMoney } from '@/components/ds/money';
import { arrowKeyNav } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { DS_TAB_TRIGGER, DS_TABS_LIST } from '@/components/ds/workspace';
import { cn } from '@/lib/utils';
import type { InvoicePaymentTrailRow } from '@/modules/billing/read';

/**
 * Overview / Payments / Related records on an invoice page (candidate or
 * employer payer). The Overview panel holds the server-rendered printable
 * and stays in the DOM on every tab so printing always prints the
 * invoice; the other panels are read-only views over the same data.
 * `?tab=` is kept in sync for deep links and history.
 */

const PAYMENT_LABEL: Record<InvoicePaymentTrailRow['status'], string> = {
  PENDING: 'Pending',
  PROOF_UPLOADED: 'Pending',
  VERIFIED: 'Paid',
  REJECTED: 'Rejected',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

const TAB_ORDER = ['overview', 'payments', 'related'] as const;
type InvoiceTab = (typeof TAB_ORDER)[number];

export type RelatedRecordLink = {
  key: string;
  label: string;
  detail: string;
  href: string | null;
  icon?: 'person' | 'employer' | 'document';
};

export function InvoiceDetailTabs({
  payments,
  related,
  paymentReceivedNote,
  receiptBase,
  children,
}: {
  payments: InvoicePaymentTrailRow[];
  related: RelatedRecordLink[];
  /** Green success note when the invoice is fully paid. */
  paymentReceivedNote: string | null;
  /** Receipt pages for this payer, e.g. `/candidates/<id>/receipts`;
   *  omit to show receipt numbers as plain text. */
  receiptBase?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'overview';
  const tab: InvoiceTab = (TAB_ORDER as readonly string[]).includes(raw)
    ? (raw as InvoiceTab)
    : 'overview';
  const base = useId();
  const tabId = (t: InvoiceTab) => `${base}-tab-${t}`;
  const panelId = (t: InvoiceTab) => `${base}-panel-${t}`;

  function select(next: InvoiceTab) {
    if (next === tab) return;
    const sp = new URLSearchParams(params.toString());
    if (next === 'overview') sp.delete('tab');
    else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    arrowKeyNav(e);
    const v = (document.activeElement as HTMLElement | null)?.dataset.tab;
    if (v && v !== tab) select(v as InvoiceTab);
  }

  const labels: Record<InvoiceTab, string> = {
    overview: 'Overview',
    payments: `Payments (${payments.length})`,
    related: 'Related records',
  };

  return (
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label="Invoice sections"
        onKeyDown={onKeyDown}
        className={cn(DS_TABS_LIST, 'flex items-center overflow-x-auto print:hidden')}
      >
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            id={tabId(t)}
            role="tab"
            type="button"
            data-tab={t}
            data-selected={tab === t ? '' : undefined}
            aria-selected={tab === t}
            aria-controls={panelId(t)}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => select(t)}
            className={DS_TAB_TRIGGER}
          >
            {labels[t]}
          </button>
        ))}
      </div>

      {/* Overview — always rendered so printing keeps working; hidden
          from view (not from print) when another tab is active. */}
      <div
        id={panelId('overview')}
        role="tabpanel"
        aria-labelledby={tabId('overview')}
        className={cn('min-w-0', tab !== 'overview' && 'hidden print:block')}
      >
        {children}
        {paymentReceivedNote && (
          <div className="pb-8 print:hidden">
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
        <div
          id={panelId('payments')}
          role="tabpanel"
          aria-labelledby={tabId('payments')}
          className="mt-4 pb-8 print:hidden"
        >
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
                        {formatMoney(p.amount, p.currencyCode)}
                        {/* Tone deliberately unchanged (always green) — the
                            per-status colour fix awaits approval, see
                            docs/finance-followups-proposal.md §3. */}
                        <DsStatusPill tone="green" className="ml-2 align-middle">
                          {PAYMENT_LABEL[p.status]}
                        </DsStatusPill>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.method.replace(/_/g, ' ')}
                        {p.proofReference && ` · ref ${p.proofReference}`}
                        {p.receivedAt &&
                          ` · received ${format(p.receivedAt, 'dd MMM yyyy · HH:mm')}`}{' '}
                        · recorded {format(p.createdAt, 'dd MMM yyyy · HH:mm')}
                      </p>
                    </div>
                    {p.receiptNumber &&
                      (receiptBase ? (
                        <Link
                          href={`${receiptBase}/${p.receiptNumber}`}
                          aria-label={`Open receipt ${p.receiptNumber}`}
                          className="shrink-0 rounded-sm text-xs font-medium text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
                        >
                          {p.receiptNumber}
                        </Link>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-sky-700 dark:text-sky-300">
                          {p.receiptNumber}
                        </span>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'related' && (
        <div
          id={panelId('related')}
          role="tabpanel"
          aria-labelledby={tabId('related')}
          className="mt-4 pb-8 print:hidden"
        >
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <ul className="divide-y">
              {related.map((r) => {
                const Icon =
                  r.icon === 'person' ? UserRound : r.icon === 'employer' ? Building2 : FileText;
                return (
                  <li key={r.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-xl',
                        DS_SOFT.blue,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{r.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                        {r.detail}
                      </p>
                    </div>
                    {r.href && (
                      <Link
                        href={r.href}
                        aria-label={`Open ${r.label}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
                      >
                        Open <ExternalLink className="size-3" aria-hidden />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
