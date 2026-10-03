import { format } from 'date-fns';
import { Library } from 'lucide-react';
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
import { type BalanceSheetRow, fetchBalanceSheet } from '@/modules/accounting/reports';

export const dynamic = 'force-dynamic';

/**
 * Balance sheet at a point in time. Three sections (Assets /
 * Liabilities / Equity) plus a synthetic "Current Year P&L" line that
 * keeps the sheet balanced before a year-end close journal exists.
 *
 * Range is a single date: `?asOf=YYYY-MM-DD`. Default is today.
 */
export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePermission('main', 'accounting', 'view');
  const { asOf } = await searchParams;
  const asOfDate = asOf ? new Date(asOf) : new Date();
  const bs = await fetchBalanceSheet(asOfDate);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Library}
          badge="Accounting · Report"
          title="Balance sheet"
          description={`Position as at ${format(asOfDate, 'd MMM yyyy')}. Assets = Liabilities + Equity; if the balanced badge is red the ledger has drifted.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Balance sheet' },
          ]}
          meta={
            <div className="flex items-center gap-2 text-xs">
              <Badge
                variant={bs.totals.balanced ? 'default' : 'destructive'}
                className="rounded-full"
              >
                {bs.totals.balanced ? 'Balanced ✓' : 'UNBALANCED ✗'}
              </Badge>
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6 space-y-5">
        <Section title="Assets" rows={bs.assets} total={bs.totals.assets} />
        <Section title="Liabilities" rows={bs.liabilities} total={bs.totals.liabilities} />
        <EquitySection
          rows={bs.equity}
          currentYearProfit={bs.totals.currentYearProfit}
          totalEquity={bs.totals.equity}
        />

        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider">Total assets</span>
              <span className="text-xl font-semibold tabular-nums">{bs.totals.assets}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm font-semibold uppercase tracking-wider">
                Total liabilities + equity
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {bs.totals.liabilitiesPlusEquity}
              </span>
            </div>
            {!bs.totals.balanced && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Balance sheet does not balance. Difference:{' '}
                {(
                  Number.parseFloat(bs.totals.assets) -
                  Number.parseFloat(bs.totals.liabilitiesPlusEquity)
                ).toFixed(2)}
                . Check the Trial Balance for the drifted account.
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}

function Section({
  title,
  rows,
  total,
}: {
  title: string;
  rows: BalanceSheetRow[];
  total: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">{title}</h2>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No {title.toLowerCase()} with a non-zero balance yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="w-36 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.accountCode}>
                  <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                  <TableCell className="text-sm">{r.accountName}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.balance}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell />
                <TableCell className="text-right text-xs font-semibold uppercase tracking-wider">
                  Total
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {total}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EquitySection({
  rows,
  currentYearProfit,
  totalEquity,
}: {
  rows: BalanceSheetRow[];
  currentYearProfit: string;
  totalEquity: string;
}) {
  const profitFloat = Number.parseFloat(currentYearProfit);
  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">Equity</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-36 text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.accountCode}>
                <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                <TableCell className="text-sm">{r.accountName}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{r.balance}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-mono text-xs text-muted-foreground">—</TableCell>
              <TableCell>
                <span className="text-sm">Current year profit / (loss)</span>
                <div className="text-[11px] text-muted-foreground">
                  Synthetic — net of REVENUE / OTHER_INCOME less COST_OF_SALES / EXPENSE /
                  OTHER_EXPENSE YTD. Posted at year-end to Retained Earnings.
                </div>
              </TableCell>
              <TableCell
                className={`text-right text-sm tabular-nums ${
                  profitFloat < 0 ? 'text-destructive' : ''
                }`}
              >
                {currentYearProfit}
              </TableCell>
            </TableRow>
            <TableRow className="border-t-2">
              <TableCell />
              <TableCell className="text-right text-xs font-semibold uppercase tracking-wider">
                Total equity
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {totalEquity}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
