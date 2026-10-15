import { AlertCircle, CircleDollarSign, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import type { PaymentsSummary } from '@/modules/commerce/service';

/**
 * Three KPI tiles above the Payments table. Values respect the page's
 * date filter — same shape pattern as the dashboard's FinanceKpiCard so
 * users recognise them, but split into three equal cards instead of
 * nested panels inside one Finance card.
 *
 * Per-currency amounts because EUR + ZAR can't honestly be summed.
 */
export function PaymentsKpiCards({ summary }: { summary: PaymentsSummary }) {
  const outstandingEntries = Object.entries(summary.outstandingByCurrency);
  const overdueEntries = Object.entries(summary.overdueByCurrency);
  const receivedEntries = Object.entries(summary.receivedByCurrency);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card className="border-status-warning/20 bg-status-warning/5">
        <CardContent className="pt-5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-warning">
            <FileText className="size-3" /> Outstanding
          </div>
          <p className="text-xl font-semibold tabular-nums">
            {summary.outstandingCount}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              invoice{summary.outstandingCount === 1 ? '' : 's'}
            </span>
          </p>
          {outstandingEntries.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs tabular-nums text-foreground/80">
              {outstandingEntries.map(([currency, amount]) => (
                <li key={currency}>{formatCurrency(amount, currency)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">Nothing outstanding.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="pt-5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
            <AlertCircle className="size-3" /> Overdue
          </div>
          <p className="text-xl font-semibold tabular-nums text-destructive">
            {summary.overdueCount}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              invoice{summary.overdueCount === 1 ? '' : 's'}
            </span>
          </p>
          {overdueEntries.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs tabular-nums text-foreground/80">
              {overdueEntries.map(([currency, amount]) => (
                <li key={currency}>{formatCurrency(amount, currency)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">None past 14-day threshold.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-status-success/20 bg-status-success/5">
        <CardContent className="pt-5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-status-success">
            <CircleDollarSign className="size-3" /> Received
          </div>
          <p className="text-xl font-semibold tabular-nums">
            {summary.receivedCount}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              receipt{summary.receivedCount === 1 ? '' : 's'}
            </span>
          </p>
          {receivedEntries.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs tabular-nums text-status-success">
              {receivedEntries.map(([currency, amount]) => (
                <li key={currency}>{formatCurrency(amount, currency)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">Nothing received in range.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
