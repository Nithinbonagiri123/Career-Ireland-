import { CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchYearEndCloseStatus } from '@/modules/accounting/year-end-close';
import { ACC_CRUMBS, ACC_PAGE } from '../accounting-ui';
import { YearEndCloseButton } from './year-end-close-button';

export const dynamic = 'force-dynamic';

/**
 * Year-end close admin page. Shows the current year + the three prior
 * years with per-year close status. Clicking Close posts the balancing
 * journal that moves the P&L accounts into Retained Earnings.
 */
export default async function YearEndClosePage() {
  await requirePermission('main', 'accounting', 'view');

  const currentYear = new Date().getUTCFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  const statuses = await Promise.all(years.map((y) => fetchYearEndCloseStatus(y)));

  return (
    <div className={cn(ACC_PAGE, 'max-w-4xl')}>
      <FadeUp>
        <PageHeader
          icon={CalendarCheck}
          iconTone="yellow"
          title="Year-end close"
          description="Moves every profit and loss account's balance into Retained Earnings in one journal. After it posts, the balance sheet's current-year profit line drops to zero. Admin only."
          breadcrumbs={[...ACC_CRUMBS, { label: 'Year-end close' }]}
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <ul className="space-y-3">
          {years.map((year, i) => {
            const status = statuses[i];
            const isFuture = year > currentYear;
            const canClose = year < currentYear && !status.closed;
            const disabledReason = status.closed
              ? 'Already closed'
              : year >= currentYear
                ? 'Year has not ended yet'
                : undefined;
            return (
              <li
                key={year}
                className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">FY {year}</h3>
                    {status.closed ? (
                      <DsStatusPill tone="green">Closed</DsStatusPill>
                    ) : year === currentYear ? (
                      <DsStatusPill tone="blue">Current year</DsStatusPill>
                    ) : isFuture ? (
                      <DsStatusPill tone="slate">Future</DsStatusPill>
                    ) : (
                      <DsStatusPill tone="amber">Open</DsStatusPill>
                    )}
                  </div>
                  {status.closed && status.journalId ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Closed by journal{' '}
                      <Link
                        href={`/admin/accounting/journals/${status.journalId}`}
                        className={cn(
                          'rounded-sm font-mono text-foreground underline underline-offset-2',
                          FOCUS_RING,
                        )}
                      >
                        {status.journalNumber}
                      </Link>
                    </p>
                  ) : year === currentYear ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      FY {year} can be closed once the year ends on 31 December.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Profit and loss balances are still open; close the year to move them into
                      Retained Earnings.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                  <YearEndCloseButton
                    year={year}
                    disabled={!canClose}
                    disabledReason={disabledReason}
                  />
                  {!canClose && disabledReason && (
                    <span className="text-xs text-muted-foreground">{disabledReason}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </FadeUp>
    </div>
  );
}
