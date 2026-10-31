import { AlertTriangle, CheckCircle2, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '@/components/ds/money';
import { DsStatusPill } from '@/components/ds/status-pill';
import { SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import type { AgingBucket, AgingReport } from '@/modules/billing/aging';

/**
 * Invoice aging for the Main Dashboard (Stage 6G). Shows the outstanding
 * ISSUED-invoice pipeline split into four buckets, per currency (no FX
 * rollup — matches the revenue widget's rules). Amounts are whole units,
 * as before. Display only.
 *
 * Bucket meaning:
 *   current  — 0-13 days since issued  (still inside tolerance)
 *   d14_30   — 14-30 days              (soft-overdue)
 *   d31_60   — 31-60 days              (hard-overdue)
 *   d60_plus — 60+ days                (very overdue — write-off risk)
 */
const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: 'Current',
  d14_30: '14-30 days',
  d31_60: '31-60 days',
  d60_plus: '60+ days',
};

const OVERDUE_BUCKETS: AgingBucket[] = ['d14_30', 'd31_60', 'd60_plus'];
const ALL_BUCKETS: AgingBucket[] = ['current', 'd14_30', 'd31_60', 'd60_plus'];

const whole = (amount: number | string, currency: string) =>
  formatMoney(amount, currency, { decimals: false });

export function AgingSection({ report }: { report: AgingReport }) {
  const hasAnyOverdue = report.overdueTotals.length > 0;
  const hasAnyInvoices = ALL_BUCKETS.some((b) => report.buckets[b].length > 0);

  return (
    <SectionCard
      icon={Hourglass}
      title="Invoice aging"
      testId="invoice-aging"
      action={
        hasAnyOverdue ? (
          <DsStatusPill tone="rose">
            <AlertTriangle className="mr-1 size-3" aria-hidden />
            Overdue invoices
          </DsStatusPill>
        ) : hasAnyInvoices ? (
          <DsStatusPill tone="green">
            <CheckCircle2 className="mr-1 size-3" aria-hidden />
            No overdue
          </DsStatusPill>
        ) : null
      }
      bodyClassName="space-y-4"
    >
      {!hasAnyInvoices ? (
        <EmptyState
          title="No unpaid invoices"
          description="Every issued invoice has been paid or voided."
        />
      ) : (
        <>
          {hasAnyOverdue && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                Overdue outstanding
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {report.overdueTotals.map((t) => (
                  <p key={t.currencyCode} className="text-base font-semibold tabular-nums">
                    {whole(t.total, t.currencyCode)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      · {t.count} {t.count === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Aging buckets">
            {ALL_BUCKETS.map((bucket) => {
              const rows = report.buckets[bucket];
              const isOverdue = OVERDUE_BUCKETS.includes(bucket);
              const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
              return (
                <li
                  key={bucket}
                  className="min-w-0 rounded-xl border border-border/60 bg-card px-3 py-3"
                  data-overdue={isOverdue ? 'true' : undefined}
                >
                  <p
                    className={cn(
                      'text-[11px] font-semibold uppercase tracking-wider',
                      isOverdue ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground',
                    )}
                  >
                    {BUCKET_LABELS[bucket]}
                    {isOverdue && <span className="sr-only"> (overdue)</span>}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {totalCount}
                    <span className="sr-only"> {totalCount === 1 ? 'invoice' : 'invoices'}</span>
                  </p>
                  {rows.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">—</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {rows.map((r) => (
                        <li
                          key={r.currencyCode}
                          className="truncate text-xs tabular-nums text-muted-foreground"
                        >
                          {whole(r.total, r.currencyCode)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            Buckets group issued invoices by days since issue.{' '}
            <Link href="/payments" className="underline underline-offset-2 hover:text-foreground">
              See all payments
            </Link>
            .
          </p>
        </>
      )}
    </SectionCard>
  );
}
