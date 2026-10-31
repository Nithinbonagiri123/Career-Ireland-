import { format } from 'date-fns';
import { Library, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { BalanceCheck } from '@/components/ds/balance-check';
import { DsTable, DsTBody, DsTd, DsTFoot, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { Money } from '@/components/ds/money';
import { AsOfPicker } from '@/components/ds/report-date-picker';
import { isIsoDay, parseDateParam, toIsoDay } from '@/components/ds/report-dates';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { type BalanceSheetRow, fetchBalanceSheet } from '@/modules/accounting/reports';
import { ACC_CRUMBS, ACC_PAGE, EmptyLine, FLUSH_TABLE, LEDGER_CURRENCY } from '../accounting-ui';
import { ReportToolbar } from '../report-toolbar';

export const dynamic = 'force-dynamic';

/**
 * Balance sheet at a point in time (`?asOf=YYYY-MM-DD`, default today).
 * Assets / Liabilities / Equity, plus a "Current year profit" line that
 * keeps the sheet balanced until the year-end close journal posts.
 */
export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePermission('main', 'accounting', 'view');
  const { asOf } = await searchParams;
  const today = new Date();
  // An invalid `?asOf=` falls back to today instead of throwing.
  const asOfDate = parseDateParam(asOf, today);
  const bs = await fetchBalanceSheet(asOfDate);
  const difference =
    Number.parseFloat(bs.totals.assets) - Number.parseFloat(bs.totals.liabilitiesPlusEquity);

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Library}
          iconTone="green"
          title="Balance sheet"
          description={`Position as at ${format(asOfDate, 'd MMM yyyy')}. Assets must equal liabilities plus equity.`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'Balance sheet' }]}
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <ReportToolbar
          picker={<AsOfPicker value={isIsoDay(asOf) ? asOf : toIsoDay(today)} />}
          status={
            <BalanceCheck
              balanced={bs.totals.balanced}
              difference={difference}
              currency={LEDGER_CURRENCY}
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="space-y-4">
        <Section title="Assets" rows={bs.assets} total={bs.totals.assets} />
        <Section title="Liabilities" rows={bs.liabilities} total={bs.totals.liabilities} />
        <Section
          title="Equity"
          rows={bs.equity}
          total={bs.totals.equity}
          totalLabel="Total equity"
          extraRow={
            <DsTr>
              <DsTd className="font-mono text-xs text-muted-foreground">—</DsTd>
              <DsTd>
                <div className="text-foreground">Current year profit / (loss)</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Profit or loss for the year to date. Moves to Retained Earnings at year-end close.
                </div>
              </DsTd>
              <DsTd numeric>
                <Money
                  amount={bs.totals.currentYearProfit}
                  currency={LEDGER_CURRENCY}
                  tone="negative"
                />
              </DsTd>
            </DsTr>
          }
        />

        <section
          aria-label="Balance sheet totals"
          className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">Total assets</span>
            <Money
              amount={bs.totals.assets}
              currency={LEDGER_CURRENCY}
              tone="negative"
              className="text-xl font-semibold"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="text-sm font-semibold text-foreground">
              Total liabilities + equity
            </span>
            <Money
              amount={bs.totals.liabilitiesPlusEquity}
              currency={LEDGER_CURRENCY}
              tone="negative"
              className="text-xl font-semibold"
            />
          </div>
          {!bs.totals.balanced && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                The balance sheet does not balance (difference{' '}
                <Money amount={difference} currency={LEDGER_CURRENCY} />
                ). Check the trial balance for the account that drifted.
              </span>
            </p>
          )}
        </section>
      </FadeUp>
    </div>
  );
}

function Section({
  title,
  rows,
  total,
  totalLabel = 'Total',
  extraRow,
}: {
  title: string;
  rows: BalanceSheetRow[];
  total: string;
  totalLabel?: string;
  extraRow?: ReactNode;
}) {
  const empty = rows.length === 0 && !extraRow;
  return (
    <SectionCard title={title} bodyClassName="mt-3">
      {empty ? (
        <EmptyLine>No {title.toLowerCase()} with a balance on this date.</EmptyLine>
      ) : (
        <DsTable
          label={`${title} table`}
          caption={`${title} accounts with a balance`}
          card={false}
          minWidth={300}
          className={FLUSH_TABLE}
        >
          <DsTHead>
            <tr>
              <DsTh className="w-24">Code</DsTh>
              <DsTh>Account</DsTh>
              <DsTh numeric className="w-40">
                Balance
              </DsTh>
            </tr>
          </DsTHead>
          <DsTBody>
            {rows.map((r) => (
              <DsTr key={r.accountCode}>
                <DsTd className="font-mono text-xs">{r.accountCode}</DsTd>
                <DsTd className="text-foreground">{r.accountName}</DsTd>
                <DsTd numeric>
                  <Money amount={r.balance} currency={LEDGER_CURRENCY} tone="negative" />
                </DsTd>
              </DsTr>
            ))}
            {extraRow}
          </DsTBody>
          <DsTFoot>
            <tr>
              <th scope="row" colSpan={2} className="px-4 py-3 text-left text-sm font-semibold">
                {totalLabel}
              </th>
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
