import { CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { fetchYearEndCloseStatus } from '@/modules/accounting/year-end-close';
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
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CalendarCheck}
          badge="Accounting"
          title="Year-end close"
          description="Zero every P&L account into Retained Earnings. Posts one atomic journal; after it lands, the Balance Sheet's synthetic current-year-profit line goes to zero and the equity section is 'real'. ADMIN only."
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Year-end close' },
          ]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6 space-y-3">
        {years.map((year, i) => {
          const status = statuses[i];
          const isFuture = year > currentYear;
          const canClose = year < currentYear && !status.closed;
          return (
            <Card key={year}>
              <CardContent className="flex items-center justify-between pt-5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">FY {year}</h3>
                    {status.closed ? (
                      <Badge variant="default" className="rounded-full text-[10px]">
                        Closed
                      </Badge>
                    ) : year === currentYear ? (
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        Current year
                      </Badge>
                    ) : isFuture ? (
                      <Badge variant="outline" className="rounded-full text-[10px]">
                        Future
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-full text-[10px]">
                        Open
                      </Badge>
                    )}
                  </div>
                  {status.closed && status.journalId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Closed via journal{' '}
                      <Link
                        href={`/admin/accounting/journals/${status.journalId}`}
                        className="font-mono text-foreground underline-offset-2 hover:underline"
                      >
                        {status.journalNumber}
                      </Link>
                    </p>
                  ) : year === currentYear ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      You can close FY {year} once the year ends on 31 Dec.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      P&L balances still carry; close to roll into Retained Earnings.
                    </p>
                  )}
                </div>
                <YearEndCloseButton
                  year={year}
                  disabled={!canClose}
                  disabledReason={
                    status.closed
                      ? 'Already closed'
                      : year >= currentYear
                        ? 'Year has not ended yet'
                        : undefined
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </FadeUp>
    </div>
  );
}
