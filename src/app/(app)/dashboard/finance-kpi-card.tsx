import { AlertCircle, ArrowRight, CircleDollarSign, FileText } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '@/components/ds/money';
import { FOCUS_RING } from '@/components/ds/segmented';
import { StatTile } from '@/components/ds/stat-tile';
import { SectionCard } from '@/components/ds/workspace';
import { cn } from '@/lib/utils';
import { OVERDUE_THRESHOLD_DAYS } from '@/modules/billing/aging';
import type { DashboardMetrics } from '@/modules/dashboard/service';

/**
 * Finance-at-a-glance (Stage 6G). Sums are broken out per currency because
 * adding EUR + ZAR into one line would be dishonest. Renders even when
 * everything is zero so the owner sees "nothing outstanding" as a positive
 * confirmation instead of a hidden panel. Display only.
 */
export function FinanceKpiCard({ invoicing }: { invoicing: DashboardMetrics['invoicing'] }) {
  const outstanding = Object.entries(invoicing.outstandingByCurrency).map(([c, a]) =>
    formatMoney(a, c),
  );
  const received = Object.entries(invoicing.receivedThisMonthByCurrency).map(([c, a]) =>
    formatMoney(a, c),
  );
  const plural = (n: number) => `invoice${n === 1 ? '' : 's'}`;

  return (
    <SectionCard
      icon={CircleDollarSign}
      title="Finance"
      description="Per currency — amounts in different currencies are never added together."
      testId="finance-kpi-card"
      action={
        <Link
          href="/payments"
          className={cn(
            'inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline',
            FOCUS_RING,
          )}
        >
          Payments <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {/* Columns follow the card's own width (not the screen), so long
          amounts never overflow a narrow tile beside the sidebar. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <StatTile
            icon={FileText}
            tone="amber"
            label="Outstanding"
            value={
              <>
                {invoicing.outstandingCount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {plural(invoicing.outstandingCount)}
                </span>
              </>
            }
            hint={outstanding.length > 0 ? outstanding.join(' · ') : 'Nothing outstanding.'}
          />
          <StatTile
            icon={AlertCircle}
            tone="rose"
            label="Overdue"
            value={
              <>
                {invoicing.overdueCount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {plural(invoicing.overdueCount)}
                </span>
              </>
            }
            hint={`Unpaid ${OVERDUE_THRESHOLD_DAYS}+ days after issue.`}
          />
          <StatTile
            icon={CircleDollarSign}
            tone="green"
            label="Received this month"
            value={received[0] ?? '—'}
            hint={
              received.length > 1
                ? `${received.slice(1).join(' · ')} · receipts since the 1st`
                : 'Receipts issued since the 1st of the month.'
            }
          />
        </div>
      </div>
    </SectionCard>
  );
}
