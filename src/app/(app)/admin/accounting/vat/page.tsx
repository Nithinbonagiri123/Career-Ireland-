import { format } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  Landmark,
  Percent,
  RotateCcw,
} from 'lucide-react';
import { DsTable, DsTBody, DsTd, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { formatMoney, Money } from '@/components/ds/money';
import { ReportRangePicker } from '@/components/ds/report-date-picker';
import { isIsoDay, parseDateParam, toIsoDay } from '@/components/ds/report-dates';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import type { DsTone } from '@/components/ds/tones';
import { SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchVatSummary } from '@/modules/accounting/vat';
import {
  ACC_CRUMBS,
  ACC_PAGE,
  COL_SM,
  FLUSH_TABLE,
  LEDGER_CURRENCY,
  PHONE_NOTE,
} from '../accounting-ui';
import { ReportToolbar } from '../report-toolbar';

export const dynamic = 'force-dynamic';

/**
 * VAT return page. Mirrors the Irish VAT3 form's T1 / T2 / T3 / T4
 * structure so finance can transcribe the headline totals into the
 * Revenue Online Service return. The CSV export lists every transaction
 * in the period so the figures can be reconciled line by line.
 *
 * Range: `?from=YYYY-MM-DD&to=YYYY-MM-DD`, default the current calendar
 * month (bimonthly filers pick the two-month window).
 */
export default async function VatReturnPage({
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
  const summary = await fetchVatSummary(fromDate, toDate);

  const exportHref = `/api/accounting/vat/export?from=${encodeURIComponent(summary.from)}&to=${encodeURIComponent(summary.to)}`;
  const hasActivity = summary.outputByRate.length > 0 || summary.inputByRate.length > 0;
  const isZero = (v: string) => Number.parseFloat(v) === 0;
  const eur = (v: string) => formatMoney(v, LEDGER_CURRENCY);

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Percent}
          iconTone="purple"
          title="VAT return"
          description={`${format(fromDate, 'd MMM yyyy')} – ${format(toDate, 'd MMM yyyy')}. Figures map onto the Irish VAT3 form (T1–T4). The CSV export lists every transaction behind them.`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'VAT return' }]}
          action={
            hasActivity ? (
              <a href={exportHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Download className="mr-1.5 size-4" aria-hidden /> Export CSV
              </a>
            ) : null
          }
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

      {/* T1–T4 always render — zero figures are themselves the answer
          ("nothing to file this period"). */}
      <FadeUp delay={0.05} className="mb-5">
        <StatTileGrid className="grid-cols-1 sm:grid-cols-2">
          <Headline
            code="T1"
            icon={ArrowUpRight}
            label="VAT on sales"
            amount={summary.totals.t1}
            hint={`Net turnover ${eur(summary.totals.netSalesTurnover)}`}
            tone={isZero(summary.totals.t1) ? 'slate' : 'green'}
          />
          <Headline
            code="T2"
            icon={ArrowDownLeft}
            label="VAT on purchases"
            amount={summary.totals.t2}
            hint={
              isZero(summary.totals.t2)
                ? 'No purchase VAT in this period'
                : `Net purchases ${eur(summary.totals.netPurchases)}`
            }
            tone={isZero(summary.totals.t2) ? 'slate' : 'blue'}
          />
          <Headline
            code="T3"
            icon={Landmark}
            label="VAT payable"
            amount={summary.totals.t3}
            hint="T1 − T2, if positive"
            tone={isZero(summary.totals.t3) ? 'slate' : 'green'}
          />
          <Headline
            code="T4"
            icon={RotateCcw}
            label="VAT repayable"
            amount={summary.totals.t4}
            hint="T2 − T1, if positive"
            tone={isZero(summary.totals.t4) ? 'slate' : 'amber'}
          />
        </StatTileGrid>
      </FadeUp>

      {!hasActivity ? (
        <FadeUp delay={0.1}>
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyState
              icon={FileSpreadsheet}
              title="No VAT activity in this period"
              description="Nothing with VAT was posted between these dates. Check the date range; VAT is only recorded when the VAT rate in Admin settings is above 0."
            />
          </div>
        </FadeUp>
      ) : (
        <FadeUp delay={0.1} className="space-y-4">
          <RateBreakdown title="Output VAT by rate (sales)" rows={summary.outputByRate} />
          {summary.outputByDivision.length > 0 && (
            <DivisionBreakdown rows={summary.outputByDivision} />
          )}
          {summary.inputByRate.length > 0 && (
            <RateBreakdown title="Input VAT by rate (purchases)" rows={summary.inputByRate} />
          )}
        </FadeUp>
      )}
    </div>
  );
}

function Headline({
  code,
  icon,
  label,
  amount,
  hint,
  tone,
}: {
  code: string;
  icon: typeof Percent;
  label: string;
  amount: string;
  hint: string;
  tone: DsTone;
}) {
  return (
    <StatTile
      icon={icon}
      tone={tone}
      label={label}
      value={<Money amount={amount} currency={LEDGER_CURRENCY} />}
      trend={
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
          {code}
        </span>
      }
      hint={hint}
    />
  );
}

function RateBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    taxCode: string;
    taxRatePercent: string;
    netAmount: string;
    taxAmount: string;
    transactionCount: number;
  }>;
}) {
  return (
    <SectionCard title={title} bodyClassName="mt-3">
      <DsTable
        label={`${title} table`}
        caption={title}
        card={false}
        minWidth={300}
        className={FLUSH_TABLE}
      >
        <DsTHead>
          <tr>
            <DsTh className={cn('w-32', COL_SM)}>Code</DsTh>
            <DsTh className="w-24">Rate</DsTh>
            <DsTh numeric className={cn('w-24', COL_SM)}>
              Count
            </DsTh>
            <DsTh numeric>Net</DsTh>
            <DsTh numeric>VAT</DsTh>
          </tr>
        </DsTHead>
        <DsTBody>
          {rows.map((r) => (
            <DsTr key={`${r.taxCode}-${r.taxRatePercent}`}>
              <DsTd className={cn('font-mono text-xs', COL_SM)}>{r.taxCode}</DsTd>
              <DsTd>
                <div className="tabular-nums text-foreground">{r.taxRatePercent}%</div>
                <div className={PHONE_NOTE}>
                  <span className="font-mono">{r.taxCode}</span> · {r.transactionCount}{' '}
                  {r.transactionCount === 1 ? 'transaction' : 'transactions'}
                </div>
              </DsTd>
              <DsTd numeric className={COL_SM}>
                {r.transactionCount}
              </DsTd>
              <DsTd numeric>
                <Money amount={r.netAmount} currency={LEDGER_CURRENCY} tone="negative" />
              </DsTd>
              <DsTd numeric className="font-medium">
                <Money amount={r.taxAmount} currency={LEDGER_CURRENCY} tone="negative" />
              </DsTd>
            </DsTr>
          ))}
        </DsTBody>
      </DsTable>
    </SectionCard>
  );
}

function DivisionBreakdown({
  rows,
}: {
  rows: Array<{
    divisionCode: string | null;
    divisionName: string | null;
    netAmount: string;
    taxAmount: string;
    transactionCount: number;
  }>;
}) {
  return (
    <SectionCard title="Output VAT by division" bodyClassName="mt-3">
      <DsTable
        label="Output VAT by division table"
        caption="Output VAT by division"
        card={false}
        minWidth={300}
        className={FLUSH_TABLE}
      >
        <DsTHead>
          <tr>
            <DsTh>Division</DsTh>
            <DsTh numeric className={cn('w-24', COL_SM)}>
              Count
            </DsTh>
            <DsTh numeric>Net</DsTh>
            <DsTh numeric>VAT</DsTh>
          </tr>
        </DsTHead>
        <DsTBody>
          {rows.map((r) => (
            <DsTr key={r.divisionCode ?? 'none'}>
              <DsTd>
                <div className="text-foreground">
                  {r.divisionName ?? <span className="text-muted-foreground">No division</span>}
                </div>
                <div className={PHONE_NOTE}>
                  {r.transactionCount} {r.transactionCount === 1 ? 'transaction' : 'transactions'}
                </div>
              </DsTd>
              <DsTd numeric className={COL_SM}>
                {r.transactionCount}
              </DsTd>
              <DsTd numeric>
                <Money amount={r.netAmount} currency={LEDGER_CURRENCY} tone="negative" />
              </DsTd>
              <DsTd numeric className="font-medium">
                <Money amount={r.taxAmount} currency={LEDGER_CURRENCY} tone="negative" />
              </DsTd>
            </DsTr>
          ))}
        </DsTBody>
      </DsTable>
    </SectionCard>
  );
}
