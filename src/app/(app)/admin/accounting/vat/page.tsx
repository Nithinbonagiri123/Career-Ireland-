import { format } from 'date-fns';
import { Download, FileSpreadsheet, Percent } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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
import { fetchVatSummary } from '@/modules/accounting/vat';

export const dynamic = 'force-dynamic';

/**
 * VAT return page. Mirrors the Irish VAT3 form's T1 / T2 / T3 structure
 * so finance can transcribe the headline totals into the Revenue Online
 * Service return. The CSV export underneath lists every transaction in
 * the period so the number can be reconciled line-by-line.
 *
 * Range is query-string driven: `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 * Default is the current calendar month — bimestrial filers can pass
 * the two-month window.
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
  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : defaultTo;
  const summary = await fetchVatSummary(fromDate, toDate);

  const exportHref = `/api/accounting/vat/export?from=${encodeURIComponent(summary.from)}&to=${encodeURIComponent(summary.to)}`;

  const hasActivity = summary.outputByRate.length > 0 || summary.inputByRate.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Percent}
          badge="Accounting · Report"
          title="VAT return"
          description={`${format(fromDate, 'd MMM yyyy')} — ${format(toDate, 'd MMM yyyy')}. Fields map onto the Irish VAT3 form (T1 / T2 / T3). CSV export lists every underlying transaction for Revenue filing.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'VAT return' },
          ]}
          action={
            hasActivity ? (
              <a href={exportHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Download className="mr-1.5 size-4" /> Export CSV
              </a>
            ) : null
          }
        />
      </FadeUp>

      {!hasActivity ? (
        <FadeUp delay={0.05} className="mt-6">
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                icon={FileSpreadsheet}
                title="No tax activity in range"
                description="Nothing has posted with non-zero VAT between the from/to dates. Check your date range or set app_settings.vat_rate_percent above 0 — the ledger only captures tax when the rate is non-zero."
              />
            </CardContent>
          </Card>
        </FadeUp>
      ) : (
        <>
          <FadeUp
            delay={0.05}
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <HeadlineCard
              code="T1"
              label="VAT on sales"
              amount={summary.totals.t1}
              hint={`Net turnover ${summary.totals.netSalesTurnover}`}
              tone="emerald"
            />
            <HeadlineCard
              code="T2"
              label="VAT on purchases"
              amount={summary.totals.t2}
              hint={
                summary.totals.t2 === '0.00'
                  ? 'No AP flow yet (Phase 7)'
                  : `Net purchases ${summary.totals.netPurchases}`
              }
              tone="muted"
            />
            <HeadlineCard
              code="T3"
              label="VAT payable"
              amount={summary.totals.t3}
              hint="= T1 − T2 (if positive)"
              tone={summary.totals.t3 === '0.00' ? 'muted' : 'emerald'}
            />
            <HeadlineCard
              code="T4"
              label="VAT repayable"
              amount={summary.totals.t4}
              hint="= T2 − T1 (if positive)"
              tone={summary.totals.t4 === '0.00' ? 'muted' : 'warning'}
            />
          </FadeUp>

          <FadeUp delay={0.1} className="mt-6 space-y-5">
            <RateBreakdownCard title="Output VAT by rate (sales)" rows={summary.outputByRate} />
            {summary.outputByDivision.length > 0 && (
              <DivisionBreakdownCard rows={summary.outputByDivision} />
            )}
            {summary.inputByRate.length > 0 && (
              <RateBreakdownCard title="Input VAT by rate (purchases)" rows={summary.inputByRate} />
            )}
          </FadeUp>
        </>
      )}
    </div>
  );
}

function HeadlineCard({
  code,
  label,
  amount,
  hint,
  tone,
}: {
  code: string;
  label: string;
  amount: string;
  hint: string;
  tone: 'emerald' | 'muted' | 'warning';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Badge variant="secondary" className="rounded-full font-mono text-[10px]">
            {code}
          </Badge>
        </div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{amount}</div>
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

function RateBreakdownCard({
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
    <Card>
      <CardContent className="pt-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">{title}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Code</TableHead>
              <TableHead className="w-24">Rate</TableHead>
              <TableHead className="w-28 text-right">Count</TableHead>
              <TableHead className="w-36 text-right">Net</TableHead>
              <TableHead className="w-36 text-right">VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.taxCode}-${r.taxRatePercent}`}>
                <TableCell className="font-mono text-xs">{r.taxCode}</TableCell>
                <TableCell className="text-sm tabular-nums">{r.taxRatePercent}%</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {r.transactionCount}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{r.netAmount}</TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {r.taxAmount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DivisionBreakdownCard({
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
    <Card>
      <CardContent className="pt-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">
          Output VAT by division
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Division</TableHead>
              <TableHead className="w-28 text-right">Count</TableHead>
              <TableHead className="w-36 text-right">Net</TableHead>
              <TableHead className="w-36 text-right">VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.divisionCode ?? 'none'}>
                <TableCell className="text-sm">
                  {r.divisionName ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {r.transactionCount}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{r.netAmount}</TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {r.taxAmount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
