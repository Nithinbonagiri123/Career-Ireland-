import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
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
import { fetchProfitLoss, type ProfitLossRow } from '@/modules/accounting/reports';

export const dynamic = 'force-dynamic';

/**
 * Profit & Loss for a date range. Query-string driven: `?from=…&to=…`
 * (ISO dates). Default is the current calendar month.
 *
 * Grouping is `(account, division)` so staff can see revenue by
 * business line without a second report. Totals row underneath each
 * section + top-level Gross / Operating / Net below.
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

  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : defaultTo;
  const pl = await fetchProfitLoss(fromDate, toDate);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={TrendingUp}
          badge="Accounting · Report"
          title="Profit &amp; loss"
          description={`${format(fromDate, 'd MMM yyyy')} — ${format(toDate, 'd MMM yyyy')}. Revenue, costs, and the resulting net profit from the posted ledger. Pass ?from=YYYY-MM-DD&to=YYYY-MM-DD to change the range.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Profit & loss' },
          ]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6 space-y-5">
        <Section title="Revenue" rows={pl.revenue} total={pl.totals.revenue} />
        <Section title="Cost of sales" rows={pl.costOfSales} total={pl.totals.costOfSales} />

        <TotalCard label="Gross profit" amount={pl.totals.grossProfit} tone="emerald" />

        <Section
          title="Operating expenses"
          rows={pl.operatingExpense}
          total={pl.totals.operatingExpense}
        />

        <TotalCard label="Operating profit" amount={pl.totals.operatingProfit} tone="emerald" />

        {(pl.otherIncome.length > 0 || pl.otherExpense.length > 0) && (
          <>
            <Section title="Other income" rows={pl.otherIncome} total={pl.totals.otherIncome} />
            <Section title="Other expenses" rows={pl.otherExpense} total={pl.totals.otherExpense} />
          </>
        )}

        <TotalCard
          label="Net profit"
          amount={pl.totals.netProfit}
          tone={Number.parseFloat(pl.totals.netProfit) >= 0 ? 'emerald' : 'red'}
          large
        />
      </FadeUp>
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: ProfitLossRow[]; total: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">{title}</h2>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No activity.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="w-32">Division</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.accountCode}-${r.divisionCode ?? 'none'}`}>
                  <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                  <TableCell className="text-sm">{r.accountName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.divisionName ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{r.amount}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell />
                <TableCell className="text-right text-xs font-semibold uppercase tracking-wider">
                  Subtotal
                </TableCell>
                <TableCell />
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

function TotalCard({
  label,
  amount,
  tone,
  large = false,
}: {
  label: string;
  amount: string;
  tone: 'emerald' | 'red';
  large?: boolean;
}) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
  const sizeClass = large ? 'text-3xl' : 'text-2xl';
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <span className="text-sm font-medium uppercase tracking-wider">{label}</span>
        <span className={`${sizeClass} font-semibold tabular-nums ${toneClass}`}>{amount}</span>
      </CardContent>
    </Card>
  );
}
