import { format } from 'date-fns';
import { CalendarRange } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePermission } from '@/lib/auth/session';
import { statusTone } from '@/lib/ui/status-tone';
import { listPeriods } from '@/modules/accounting/periods';
import { PeriodTransitionMenu } from './period-transition-dialog';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Accounting periods list. Each row shows status, journal counts, and
 * actions permitted by the state machine. Period rows are created
 * lazily on first journal post for a month, so periods with zero
 * journal activity don't appear until used.
 */
export default async function PeriodsPage() {
  await requirePermission('main', 'accounting', 'view');
  const periods = await listPeriods(36);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CalendarRange}
          badge="Accounting"
          title="Accounting periods"
          description={`${periods.length} period(s). Status transitions: OPEN → SOFT_CLOSED → CLOSED → LOCKED, with ADMIN-only reopen on LOCKED. Close is blocked while DRAFT journals remain and when the period's trial balance doesn't tie.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Periods' },
          ]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            {periods.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="No periods yet"
                description="A period row appears for a month the first time a journal posts in it. Post a manual journal or let the outbox-drain cron create one from an invoice event."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Period</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-28 text-right">Journals</TableHead>
                    <TableHead className="w-28 text-right">Posted</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead>Locked</TableHead>
                    <TableHead className="w-32 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => {
                    const label = `${MONTH_NAMES[p.month - 1]} ${p.year}`;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell>
                          <Badge
                            variant={statusTone(p.status)}
                            className="rounded-full text-[10px]"
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {p.journalCount}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {p.postedCount}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.closedAt ? (
                            <time
                              dateTime={p.closedAt.toISOString()}
                              title={format(p.closedAt, 'd MMM yyyy · HH:mm')}
                            >
                              {format(p.closedAt, 'd MMM yyyy · HH:mm')}
                            </time>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.lockedAt ? (
                            <time
                              dateTime={p.lockedAt.toISOString()}
                              title={format(p.lockedAt, 'd MMM yyyy · HH:mm')}
                            >
                              {format(p.lockedAt, 'd MMM yyyy · HH:mm')}
                            </time>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <PeriodTransitionMenu
                            periodId={p.id}
                            currentStatus={p.status}
                            periodLabel={label}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
