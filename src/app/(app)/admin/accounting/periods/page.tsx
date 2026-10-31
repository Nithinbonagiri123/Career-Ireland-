import { CalendarRange } from 'lucide-react';
import {
  DsActionsTh,
  DsTable,
  DsTBody,
  DsTd,
  DsTHead,
  DsTh,
  DsTr,
} from '@/components/ds/data-table';
import { FinanceStatusPill } from '@/components/ds/finance-status';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { listPeriods } from '@/modules/accounting/periods';
import { ACC_CRUMBS, ACC_PAGE, formatStamp } from '../accounting-ui';
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
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={CalendarRange}
          iconTone="yellow"
          title="Accounting periods"
          description={`${periods.length} period${periods.length === 1 ? '' : 's'}. Month-end lifecycle: Open → Soft closed → Closed → Locked; only an Admin can reopen a locked period. A period can't close while draft journals remain or while its trial balance doesn't match.`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'Periods' }]}
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        {periods.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyState
              icon={CalendarRange}
              title="No periods yet"
              description="A month appears here the first time a journal is posted in it."
            />
          </div>
        ) : (
          <DsTable
            label="Accounting periods table"
            caption="Accounting periods, newest first"
            minWidth={760}
          >
            <DsTHead>
              <tr>
                <DsTh className="w-40">Period</DsTh>
                <DsTh className="w-32">Status</DsTh>
                <DsTh numeric className="w-24">
                  Journals
                </DsTh>
                <DsTh numeric className="w-24">
                  Posted
                </DsTh>
                <DsTh>Closed</DsTh>
                <DsTh>Locked</DsTh>
                <DsActionsTh />
              </tr>
            </DsTHead>
            <DsTBody>
              {periods.map((p) => {
                const label = `${MONTH_NAMES[p.month - 1]} ${p.year}`;
                return (
                  <DsTr key={p.id}>
                    <DsTd className="whitespace-nowrap font-medium text-foreground">{label}</DsTd>
                    <DsTd>
                      <FinanceStatusPill kind="period" status={p.status} />
                    </DsTd>
                    <DsTd numeric>{p.journalCount}</DsTd>
                    <DsTd numeric>{p.postedCount}</DsTd>
                    <DsTd className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {p.closedAt ? (
                        <time dateTime={p.closedAt.toISOString()}>{formatStamp(p.closedAt)}</time>
                      ) : (
                        '—'
                      )}
                    </DsTd>
                    <DsTd className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {p.lockedAt ? (
                        <time dateTime={p.lockedAt.toISOString()}>{formatStamp(p.lockedAt)}</time>
                      ) : (
                        '—'
                      )}
                    </DsTd>
                    <DsTd className="py-2 text-right">
                      <PeriodTransitionMenu
                        periodId={p.id}
                        currentStatus={p.status}
                        periodLabel={label}
                      />
                    </DsTd>
                  </DsTr>
                );
              })}
            </DsTBody>
          </DsTable>
        )}
      </FadeUp>
    </div>
  );
}
