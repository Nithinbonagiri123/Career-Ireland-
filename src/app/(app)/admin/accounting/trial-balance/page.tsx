import { format } from 'date-fns';
import { Scale } from 'lucide-react';
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
import { fetchTrialBalance } from '@/modules/accounting/reports';

export const dynamic = 'force-dynamic';

/**
 * Trial balance — a cross-check that the ledger is internally
 * consistent. If `balanced=false` on the totals row, something is
 * wrong at the database level (triggers should prevent this, but the
 * report surfaces it anyway so finance has a daily sanity check).
 */
export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requirePermission('main', 'accounting', 'view');
  const { asOf } = await searchParams;
  const asOfDate = asOf ? new Date(asOf) : new Date();
  const tb = await fetchTrialBalance(asOfDate);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Scale}
          badge="Accounting · Report"
          title="Trial balance"
          description={`Posted ledger activity up to ${format(asOfDate, 'd MMM yyyy')}. If Debits ≠ Credits, the ledger has drifted — report it.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Trial balance' },
          ]}
          meta={
            <div className="flex items-center gap-2 text-xs">
              <Badge
                variant={tb.totals.balanced ? 'default' : 'destructive'}
                className="rounded-full"
              >
                {tb.totals.balanced ? 'Balanced ✓' : 'UNBALANCED ✗'}
              </Badge>
              <span className="text-muted-foreground">
                {tb.rows.length} account{tb.rows.length === 1 ? '' : 's'} with activity
              </span>
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            {tb.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No posted journal activity yet. The report will populate as events arrive and the
                cron drains them.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="w-28">Type</TableHead>
                    <TableHead className="w-32 text-right">Debit</TableHead>
                    <TableHead className="w-32 text-right">Credit</TableHead>
                    <TableHead className="w-32 text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tb.rows.map((r) => {
                    const bal = Number.parseFloat(r.balance);
                    return (
                      <TableRow key={r.accountCode}>
                        <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                        <TableCell className="text-sm">{r.accountName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.accountType.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {Number.parseFloat(r.debit) > 0 ? r.debit : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {Number.parseFloat(r.credit) > 0 ? r.credit : '—'}
                        </TableCell>
                        <TableCell
                          className={`text-right text-sm font-medium tabular-nums ${
                            bal < 0 ? 'text-muted-foreground' : ''
                          }`}
                        >
                          {Math.abs(bal).toFixed(2)}
                          {bal < 0 && ' CR'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2">
                    <TableCell />
                    <TableCell className="text-right text-xs font-semibold uppercase tracking-wider">
                      Totals
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {tb.totals.debit}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {tb.totals.credit}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm font-semibold ${
                        tb.totals.balanced ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {tb.totals.balanced ? 'Balanced' : 'DRIFT'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
