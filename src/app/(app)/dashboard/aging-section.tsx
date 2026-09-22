import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import type { AgingBucket, AgingReport } from '@/modules/billing/aging';

/**
 * Aging AR widget for the Main Dashboard. Shows the outstanding
 * ISSUED-invoice pipeline split into four buckets, per currency (no
 * FX rollup — matches the revenue widget's rules).
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

export function AgingSection({ report }: { report: AgingReport }) {
  const hasAnyOverdue = report.overdueTotals.length > 0;
  const hasAnyInvoices = ALL_BUCKETS.some((b) => report.buckets[b].length > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Invoice aging</CardTitle>
        {hasAnyOverdue ? (
          <Badge variant="danger" className="gap-1">
            <AlertTriangle className="size-3" />
            Overdue AR
          </Badge>
        ) : hasAnyInvoices ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" />
            No overdue
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAnyInvoices ? (
          <EmptyState
            title="No unpaid invoices"
            description="Every issued invoice has been paid or voided."
          />
        ) : (
          <>
            {hasAnyOverdue && (
              <div className="rounded-lg border border-status-danger/30 bg-status-danger-soft px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-status-danger">
                  Overdue outstanding
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {report.overdueTotals.map((t) => (
                    <p key={t.currencyCode} className="text-base font-semibold tabular-nums">
                      {formatCurrency(t.total, t.currencyCode, {
                        maximumFractionDigits: 0,
                        minimumFractionDigits: 0,
                      })}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        · {t.count} {t.count === 1 ? 'invoice' : 'invoices'}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ALL_BUCKETS.map((bucket) => {
                const rows = report.buckets[bucket];
                const isOverdue = OVERDUE_BUCKETS.includes(bucket);
                const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
                return (
                  <div
                    key={bucket}
                    className="rounded-lg glass-panel px-3 py-3"
                    data-overdue={isOverdue ? 'true' : undefined}
                  >
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wider ${isOverdue ? 'text-status-danger' : 'text-muted-foreground'}`}
                    >
                      {BUCKET_LABELS[bucket]}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{totalCount}</p>
                    {rows.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">—</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5">
                        {rows.map((r) => (
                          <li
                            key={r.currencyCode}
                            className="truncate text-xs tabular-nums text-muted-foreground"
                          >
                            {formatCurrency(r.total, r.currencyCode, {
                              maximumFractionDigits: 0,
                              minimumFractionDigits: 0,
                            })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              Buckets group issued invoices by days since issue.{' '}
              <Link href="/payments" className="underline underline-offset-2 hover:text-foreground">
                See all payments
              </Link>
              .
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
