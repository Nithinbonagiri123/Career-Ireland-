import { format } from 'date-fns';
import { Scale } from 'lucide-react';
import { BalanceCheck } from '@/components/ds/balance-check';
import { DsTable, DsTBody, DsTd, DsTFoot, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { Money } from '@/components/ds/money';
import { AsOfPicker } from '@/components/ds/report-date-picker';
import { isIsoDay, parseDateParam, toIsoDay } from '@/components/ds/report-dates';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchTrialBalance } from '@/modules/accounting/reports';
import { ACC_CRUMBS, ACC_PAGE, COL_MD, COL_SM, EmptyLine, LEDGER_CURRENCY } from '../accounting-ui';
import { ReportToolbar } from '../report-toolbar';

export const dynamic = 'force-dynamic';

/**
 * Trial balance — a cross-check that the ledger is internally
 * consistent. If debits ≠ credits on the totals row, something is
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
  // An invalid `?asOf=` falls back to today instead of throwing.
  const today = new Date();
  const asOfDate = parseDateParam(asOf, today);
  const tb = await fetchTrialBalance(asOfDate);
  const difference = Number.parseFloat(tb.totals.debit) - Number.parseFloat(tb.totals.credit);

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Scale}
          iconTone="green"
          title="Trial balance"
          description={`Posted ledger activity up to ${format(asOfDate, 'd MMM yyyy')}. Total debits must equal total credits; if they don't, report it.`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'Trial balance' }]}
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <ReportToolbar
          picker={<AsOfPicker value={isIsoDay(asOf) ? asOf : toIsoDay(today)} />}
          status={
            <>
              <BalanceCheck
                balanced={tb.totals.balanced}
                difference={difference}
                currency={LEDGER_CURRENCY}
              />
              <span className="text-xs text-muted-foreground">
                {tb.rows.length} account{tb.rows.length === 1 ? '' : 's'} with activity
              </span>
            </>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        {tb.rows.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyLine>No posted journals up to this date.</EmptyLine>
          </div>
        ) : (
          <DsTable
            label="Trial balance table"
            caption={`Trial balance as of ${format(asOfDate, 'd MMM yyyy')}`}
            minWidth={360}
          >
            <DsTHead>
              <tr>
                <DsTh className={cn('w-24', COL_SM)}>Code</DsTh>
                <DsTh>Account</DsTh>
                <DsTh className={cn('w-32', COL_MD)}>Type</DsTh>
                <DsTh numeric className="w-36">
                  Debit
                </DsTh>
                <DsTh numeric className="w-36">
                  Credit
                </DsTh>
                <DsTh numeric className={cn('w-40', COL_SM)}>
                  Balance
                </DsTh>
              </tr>
            </DsTHead>
            <DsTBody>
              {tb.rows.map((r) => {
                const debit = Number.parseFloat(r.debit);
                const credit = Number.parseFloat(r.credit);
                const bal = Number.parseFloat(r.balance);
                return (
                  <DsTr key={r.accountCode}>
                    <DsTd className={cn('font-mono text-xs', COL_SM)}>{r.accountCode}</DsTd>
                    <DsTd>
                      <div className="text-foreground">{r.accountName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground md:hidden">
                        <span className="sm:hidden">
                          <span className="font-mono">{r.accountCode}</span> ·{' '}
                        </span>
                        {r.accountType.replace(/_/g, ' ').toLowerCase()}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                        Balance{' '}
                        <Money
                          amount={Math.abs(bal)}
                          currency={LEDGER_CURRENCY}
                          className="font-medium text-foreground"
                        />
                        {bal < 0 && ' CR'}
                      </div>
                    </DsTd>
                    <DsTd className={cn('text-xs text-muted-foreground', COL_MD)}>
                      {r.accountType.replace(/_/g, ' ').toLowerCase()}
                    </DsTd>
                    <DsTd numeric>
                      {debit > 0 ? <Money amount={r.debit} currency={LEDGER_CURRENCY} /> : '—'}
                    </DsTd>
                    <DsTd numeric>
                      {credit > 0 ? <Money amount={r.credit} currency={LEDGER_CURRENCY} /> : '—'}
                    </DsTd>
                    {/* Debit balances plain, credit balances marked CR (as before). */}
                    <DsTd numeric className={cn('font-medium', COL_SM)}>
                      <Money amount={Math.abs(bal)} currency={LEDGER_CURRENCY} />
                      {bal < 0 && <span className="ml-1 text-xs text-muted-foreground">CR</span>}
                    </DsTd>
                  </DsTr>
                );
              })}
            </DsTBody>
            <DsTFoot>
              <tr>
                <td className={COL_SM} />
                <th scope="row" className="px-4 py-3 text-left text-sm font-semibold">
                  Totals
                </th>
                <td className={COL_MD} />
                <DsTd numeric>
                  <Money amount={tb.totals.debit} currency={LEDGER_CURRENCY} />
                </DsTd>
                <DsTd numeric>
                  <Money amount={tb.totals.credit} currency={LEDGER_CURRENCY} />
                </DsTd>
                <DsTd numeric className={COL_SM}>
                  <BalanceCheck
                    balanced={tb.totals.balanced}
                    difference={difference}
                    currency={LEDGER_CURRENCY}
                  />
                </DsTd>
              </tr>
            </DsTFoot>
          </DsTable>
        )}
      </FadeUp>
    </div>
  );
}
