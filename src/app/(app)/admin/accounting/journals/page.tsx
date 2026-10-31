import { ArrowRight, Landmark, Plus } from 'lucide-react';
import Link from 'next/link';
import {
  DsActionsTh,
  DsCardItem,
  DsCardList,
  DsTable,
  DsTBody,
  DsTd,
  DsTHead,
  DsTh,
  DsTr,
  ResponsiveTable,
} from '@/components/ds/data-table';
import { FinanceStatusPill } from '@/components/ds/finance-status';
import { Money } from '@/components/ds/money';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import {
  fetchBusinessDivisions,
  fetchChartOfAccounts,
  fetchJournals,
} from '@/modules/accounting/read';
import { ACC_CRUMBS, ACC_PAGE, formatDay } from '../accounting-ui';
import { ManualJournalDialog } from './manual-journal-dialog';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 100;

export default async function JournalsListPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string }>;
}) {
  await requirePermission('main', 'accounting', 'view');
  const { post } = await searchParams;

  const [journals, accounts, divisions] = await Promise.all([
    fetchJournals(LIST_LIMIT),
    fetchChartOfAccounts(),
    fetchBusinessDivisions(),
  ]);

  const openLink = (id: string, number: string) => (
    <Link
      href={`/admin/accounting/journals/${id}`}
      aria-label={`Open journal ${number}`}
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
    >
      Open <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
    </Link>
  );

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Landmark}
          iconTone="blue"
          title="Journals"
          description={
            journals.length >= LIST_LIMIT
              ? `The latest ${LIST_LIMIT} journals, newest first. Every journal is a balanced posting.`
              : `${journals.length} journal${journals.length === 1 ? '' : 's'}, newest first. Every journal is a balanced posting.`
          }
          breadcrumbs={[...ACC_CRUMBS, { label: 'Journals' }]}
          action={
            <ManualJournalDialog
              accounts={accounts}
              divisions={divisions}
              defaultOpen={Boolean(post)}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" aria-hidden /> Post manual journal
                </Button>
              }
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        {journals.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyState
              icon={Landmark}
              title="No journals yet"
              description="Post a manual balanced journal to get started. Invoices, payments, credit notes and bills appear here once they are recorded in the ledger."
            />
          </div>
        ) : (
          <ResponsiveTable
            table={
              <DsTable
                label="Journals table"
                caption="Journals, newest first"
                minWidth={760}
                testId="journals-table"
              >
                <DsTHead>
                  <tr>
                    <DsTh className="w-32">Number</DsTh>
                    <DsTh className="w-28">Date</DsTh>
                    <DsTh>Description</DsTh>
                    <DsTh numeric className="w-32">
                      Total (DR)
                    </DsTh>
                    <DsTh className="w-28">Status</DsTh>
                    <DsTh className="w-36">By</DsTh>
                    <DsActionsTh />
                  </tr>
                </DsTHead>
                <DsTBody>
                  {journals.map((j) => (
                    <DsTr key={j.id}>
                      <DsTd className="whitespace-nowrap font-mono text-xs">{j.number}</DsTd>
                      <DsTd className="whitespace-nowrap text-xs tabular-nums">
                        {formatDay(j.journalDate)}
                      </DsTd>
                      <DsTd className="min-w-48 text-foreground">{j.description}</DsTd>
                      <DsTd numeric>
                        <Money amount={j.totalDebit} currency={j.transactionCurrency} />
                      </DsTd>
                      <DsTd>
                        <FinanceStatusPill kind="journal" status={j.status} />
                      </DsTd>
                      <DsTd className="text-xs text-muted-foreground">
                        {j.createdByName ?? '—'}
                      </DsTd>
                      <DsTd className="py-2 text-right">{openLink(j.id, j.number)}</DsTd>
                    </DsTr>
                  ))}
                </DsTBody>
              </DsTable>
            }
            cards={
              <DsCardList label="Journals">
                {journals.map((j) => (
                  <DsCardItem key={j.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-foreground">{j.number}</span>
                      <FinanceStatusPill kind="journal" status={j.status} />
                    </div>
                    <p className="mt-2 text-sm text-foreground [overflow-wrap:anywhere]">
                      {j.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {formatDay(j.journalDate)}
                        {j.createdByName ? ` · ${j.createdByName}` : ''}
                        <div className="mt-0.5 text-sm font-semibold text-foreground">
                          <Money amount={j.totalDebit} currency={j.transactionCurrency} />
                        </div>
                      </div>
                      {openLink(j.id, j.number)}
                    </div>
                  </DsCardItem>
                ))}
              </DsCardList>
            }
          />
        )}
      </FadeUp>
    </div>
  );
}
