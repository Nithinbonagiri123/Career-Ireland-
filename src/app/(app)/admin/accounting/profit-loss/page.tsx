import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { DsTable, DsTBody, DsTd, DsTFoot, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { Money } from '@/components/ds/money';
import { ReportRangePicker } from '@/components/ds/report-date-picker';
import { isIsoDay, parseDateParam, toIsoDay } from '@/components/ds/report-dates';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchProfitLoss, type ProfitLossRow } from '@/modules/accounting/reports';
import {
  ACC_CRUMBS,
  ACC_PAGE,
  COL_SM,
  EmptyLine,
  FLUSH_TABLE,
  LEDGER_CURRENCY,
  PHONE_NOTE,
} from '../accounting-ui';
import { ReportToolbar } from '../report-toolbar';

export const dynamic = 'force-dynamic';

/**
 * Profit & Loss for a date range (`?from=…&to=…`, ISO dates; default the
 * current calendar month). Grouped by (account, division) so revenue can
 * be read per business line; subtotal per section, then Gross /
 * Operating / Net profit.
 */
export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission('main', 'accounting', 'view');
  const { from, to } = await searchParams;

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Invalid dates fall back to the default month instead of throwing.
  const fromDate = parseDateParam(from, defaultFrom);
  const toDate = parseDateParam(to, defaultTo);
  const pl = await fetchProfitLoss(fromDate, toDate);
  const range = `${format(fromDate, 'd MMM yyyy')} – ${format(toDate, 'd MMM yyyy')}`;

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={TrendingUp}
          iconTone="green"
          title="Profit &amp; loss"
          description={`${range}. Revenue, costs and the resulting net profit from the posted ledger.`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'Profit & loss' }]}
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <ReportToolbar
          picker={
            <ReportRangePicker
              from={isIsoDay(from) ? from : toIsoDay(defaultFrom)}
              to={isIsoDay(to) ? to : toIsoDay(defaultTo)}
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="space-y-4">
        <Section title="Revenue" rows={pl.revenue} total={pl.totals.revenue} />
        <Section title="Cost of sales" rows={pl.costOfSales} total={pl.totals.costOfSales} />

        <ResultCard label="Gross profit" amount={pl.totals.grossProfit} />

        <Section
          title="Operating expenses"
          rows={pl.operatingExpense}
          total={pl.totals.operatingExpense}
        />

        <ResultCard label="Operating profit" amount={pl.totals.operatingProfit} />

        {(pl.otherIncome.length > 0 || pl.otherExpense.length > 0) && (
          <>
            <Section title="Other income" rows={pl.otherIncome} total={pl.totals.otherIncome} />
            <Section title="Other expenses" rows={pl.otherExpense} total={pl.totals.otherExpense} />
          </>
        )}

        <ResultCard label="Net profit" amount={pl.totals.netProfit} large />
      </FadeUp>
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: ProfitLossRow[]; total: string }) {
  return (
    <SectionCard title={title} bodyClassName="mt-3">
      {rows.length === 0 ? (
        <EmptyLine>No activity in this period.</EmptyLine>
      ) : (
        <DsTable
          label={`${title} table`}
          caption={`${title} by account and division`}
          card={false}
          minWidth={300}
          className={FLUSH_TABLE}
        >
          <DsTHead>
            <tr>
              <DsTh className={cn('w-24', COL_SM)}>Code</DsTh>
              <DsTh>Account</DsTh>
              <DsTh className={cn('w-36', COL_SM)}>Division</DsTh>
              <DsTh numeric className="w-36">
                Amount
              </DsTh>
            </tr>
          </DsTHead>
          <DsTBody>
            {rows.map((r) => (
              <DsTr key={`${r.accountCode}-${r.divisionCode ?? 'none'}`}>
                <DsTd className={cn('font-mono text-xs', COL_SM)}>{r.accountCode}</DsTd>
                <DsTd>
                  <div className="text-foreground">{r.accountName}</div>
                  <div className={PHONE_NOTE}>
                    <span className="font-mono">{r.accountCode}</span>
                    {r.divisionName ? ` · ${r.divisionName}` : ''}
                  </div>
                </DsTd>
                <DsTd className={cn('text-xs text-muted-foreground', COL_SM)}>
                  {r.divisionName ?? '—'}
                </DsTd>
                <DsTd numeric>
                  <Money amount={r.amount} currency={LEDGER_CURRENCY} tone="negative" />
                </DsTd>
              </DsTr>
            ))}
          </DsTBody>
          <DsTFoot>
            <tr>
              <td className={COL_SM} />
              <th scope="row" className="px-4 py-3 text-left text-sm font-semibold">
                Subtotal
              </th>
              <td className={COL_SM} />
              <DsTd numeric>
                <Money amount={total} currency={LEDGER_CURRENCY} tone="negative" />
              </DsTd>
            </tr>
          </DsTFoot>
        </DsTable>
      )}
    </SectionCard>
  );
}

function ResultCard({
  label,
  amount,
  large = false,
}: {
  label: string;
  amount: string;
  large?: boolean;
}) {
  const negative = Number.parseFloat(amount) < 0;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-4 shadow-sm sm:px-5',
        large ? 'border-primary/30' : 'border-border/60',
      )}
    >
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <Money
        amount={amount}
        currency={LEDGER_CURRENCY}
        className={cn(
          'font-semibold',
          large ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl',
          negative ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-400',
        )}
      />
    </div>
  );
}
