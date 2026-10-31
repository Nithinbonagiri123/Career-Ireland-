import { Landmark } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BalanceCheck } from '@/components/ds/balance-check';
import { DsTable, DsTBody, DsTd, DsTFoot, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { DocumentHeader } from '@/components/ds/document-header';
import { FinanceStatusPill } from '@/components/ds/finance-status';
import { Money } from '@/components/ds/money';
import { FOCUS_RING } from '@/components/ds/segmented';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchJournalWithLines } from '@/modules/accounting/read';
import { ACC_CRUMBS, ACC_PAGE, COL_MD, COL_SM, FLUSH_TABLE, formatDay } from '../../accounting-ui';
import { ReverseJournalButton } from './reverse-journal-button';

export const dynamic = 'force-dynamic';

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('main', 'accounting', 'view');
  const { id } = await params;
  const detail = await fetchJournalWithLines(id);
  if (!detail) notFound();
  const { header, lines } = detail;

  const totalDebit = lines.reduce((s, l) => s + Number.parseFloat(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number.parseFloat(l.credit), 0);
  // Display-only check on the figures above (cent precision).
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  const meta = [
    <span key="date">
      Journal date <strong className="text-foreground">{formatDay(header.journalDate)}</strong>
      {' · '}By <strong className="text-foreground">{header.createdByName ?? '—'}</strong>
    </span>,
    <span key="ccy">
      Currency <strong className="text-foreground">{header.transactionCurrency}</strong>
      {header.transactionCurrency !== header.functionalCurrency && (
        <>
          {' '}
          at <strong className="text-foreground">{header.exchangeRate}</strong>
        </>
      )}
    </span>,
  ];
  if (header.reversesJournalId && header.reversesJournalNumber) {
    meta.push(
      <span key="rev">
        Reverses{' '}
        <Link
          href={`/admin/accounting/journals/${header.reversesJournalId}`}
          className={cn(
            'rounded-sm font-mono text-foreground underline underline-offset-2',
            FOCUS_RING,
          )}
        >
          {header.reversesJournalNumber}
        </Link>
      </span>,
    );
  }

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <DocumentHeader
          breadcrumbs={[
            ...ACC_CRUMBS,
            { label: 'Journals', href: '/admin/accounting/journals' },
            { label: header.number },
          ]}
          icon={Landmark}
          kind="Journal"
          number={header.number}
          status={<FinanceStatusPill kind="journal" status={header.status} />}
          issuedAt={header.postedAt}
          issuedLabel="Posted"
          meta={[
            <span key="desc" className="text-sm text-foreground">
              {header.description}
            </span>,
            ...meta,
          ]}
          actions={
            header.status === 'POSTED' ? (
              <ReverseJournalButton journalId={header.id} journalNumber={header.number} />
            ) : null
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-5">
        <SectionCard
          title="Lines"
          count={lines.length}
          action={
            <BalanceCheck
              balanced={balanced}
              difference={totalDebit - totalCredit}
              currency={header.transactionCurrency}
            />
          }
          bodyClassName="mt-3"
        >
          <DsTable
            label="Journal lines"
            caption={`Lines of journal ${header.number}`}
            card={false}
            minWidth={320}
            className={FLUSH_TABLE}
          >
            <DsTHead>
              <tr>
                <DsTh className={cn('w-12', COL_SM)}>#</DsTh>
                <DsTh className={cn('w-24', COL_SM)}>Account</DsTh>
                <DsTh>Name</DsTh>
                <DsTh className={cn('w-32', COL_MD)}>Division</DsTh>
                <DsTh numeric className="w-32">
                  Debit
                </DsTh>
                <DsTh numeric className="w-32">
                  Credit
                </DsTh>
              </tr>
            </DsTHead>
            <DsTBody>
              {lines.map((l) => {
                const debit = Number.parseFloat(l.debit);
                const credit = Number.parseFloat(l.credit);
                return (
                  <DsTr key={l.id}>
                    <DsTd className={cn('font-mono text-xs text-muted-foreground', COL_SM)}>
                      {l.lineNumber}
                    </DsTd>
                    <DsTd className={cn('font-mono text-xs', COL_SM)}>{l.accountCode}</DsTd>
                    <DsTd>
                      <div className="text-foreground">{l.accountName}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground md:hidden">
                        <span className="font-mono sm:hidden">{l.accountCode} · </span>
                        {l.divisionName ?? 'No division'}
                      </div>
                      {l.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{l.description}</div>
                      )}
                    </DsTd>
                    <DsTd className={cn('text-xs text-muted-foreground', COL_MD)}>
                      {l.divisionName ?? '—'}
                    </DsTd>
                    <DsTd numeric>
                      {debit > 0 ? <Money amount={debit} currency={l.currencyCode} /> : '—'}
                    </DsTd>
                    <DsTd numeric>
                      {credit > 0 ? <Money amount={credit} currency={l.currencyCode} /> : '—'}
                    </DsTd>
                  </DsTr>
                );
              })}
            </DsTBody>
            <DsTFoot>
              <tr>
                <td className={COL_SM} />
                <td className={COL_SM} />
                <th scope="row" className="px-4 py-3 text-left text-sm font-semibold">
                  Totals
                </th>
                <td className={COL_MD} />
                <DsTd numeric>
                  <Money amount={totalDebit} currency={header.transactionCurrency} />
                </DsTd>
                <DsTd numeric>
                  <Money amount={totalCredit} currency={header.transactionCurrency} />
                </DsTd>
              </tr>
            </DsTFoot>
          </DsTable>
        </SectionCard>
      </FadeUp>
    </div>
  );
}
