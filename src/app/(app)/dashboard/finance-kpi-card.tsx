import { AlertCircle, ArrowRight, CircleDollarSign, FileText } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import type { DashboardMetrics } from '@/modules/dashboard/service';

/**
 * Finance-at-a-glance card. Sums are broken out per currency because
 * summing EUR + ZAR into one line would be dishonest. Renders even
 * when everything is zero so the owner sees "€0 outstanding" as a
 * positive confirmation instead of a hidden panel.
 */
export function FinanceKpiCard({ invoicing }: { invoicing: DashboardMetrics['invoicing'] }) {
  const outstandingEntries = Object.entries(invoicing.outstandingByCurrency);
  const receivedEntries = Object.entries(invoicing.receivedThisMonthByCurrency);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDollarSign className="size-4 text-status-success" />
            Finance
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Real-time from the payments + credit-notes tables. Currency-scoped so multi-currency
            invoicing doesn't blur into a single number.
          </p>
        </div>
        <Link
          href="/payments"
          className="inline-flex items-center gap-0.5 text-[11px] text-foreground/60 hover:text-foreground"
        >
          Payments <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-status-warning/20 bg-status-warning/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-warning">
              <FileText className="size-3" /> Outstanding
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {invoicing.outstandingCount}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                invoice{invoicing.outstandingCount === 1 ? '' : 's'}
              </span>
            </p>
            {outstandingEntries.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[11px] tabular-nums text-muted-foreground">
                {outstandingEntries.map(([currency, amount]) => (
                  <li key={currency}>{formatCurrency(amount, currency)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">Nothing outstanding.</p>
            )}
          </div>

          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
              <AlertCircle className="size-3" /> Overdue
            </div>
            <p className="text-lg font-semibold tabular-nums text-destructive">
              {invoicing.overdueCount}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                invoice{invoicing.overdueCount === 1 ? '' : 's'}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Past the 14-day threshold. Notification fires per invoice + escalation bucket.
            </p>
          </div>

          <div className="rounded-md border border-status-success/20 bg-status-success/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-success">
              <CircleDollarSign className="size-3" /> Received this month
            </div>
            {receivedEntries.length > 0 ? (
              <ul className="space-y-0.5 tabular-nums">
                {receivedEntries.map(([currency, amount]) => (
                  <li
                    key={currency}
                    className="text-lg font-semibold text-status-success first:mt-0"
                  >
                    {formatCurrency(amount, currency)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-lg font-semibold tabular-nums text-muted-foreground">—</p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sum of receipts issued since the 1st of the month, per currency.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
