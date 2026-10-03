import { ArrowRight, Landmark, Plus } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { formatCurrency } from '@/lib/currency';
import { statusTone } from '@/lib/ui/status-tone';
import {
  fetchBusinessDivisions,
  fetchChartOfAccounts,
  fetchJournals,
} from '@/modules/accounting/read';
import { ManualJournalDialog } from './manual-journal-dialog';

export const dynamic = 'force-dynamic';

export default async function JournalsListPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string }>;
}) {
  await requirePermission('main', 'accounting', 'view');
  const { post } = await searchParams;

  const [journals, accounts, divisions] = await Promise.all([
    fetchJournals(100),
    fetchChartOfAccounts(),
    fetchBusinessDivisions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Landmark}
          badge="Accounting"
          title="Journals"
          description={`${journals.length} entries (most recent first). Every row is a balanced posting; click Open to see the lines.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Journals' },
          ]}
          action={
            <ManualJournalDialog
              accounts={accounts}
              divisions={divisions}
              defaultOpen={Boolean(post)}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" /> Post manual journal
                </Button>
              }
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            {journals.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="No journals yet"
                description="Post a manual balanced journal to get started. Once the Phase 2 event wiring lands, every invoice/payment/credit-note will also appear here."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Number</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-28 text-right">Total (DR)</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-32">By</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journals.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">{j.number}</TableCell>
                      <TableCell className="text-xs tabular-nums">{j.journalDate}</TableCell>
                      <TableCell className="text-sm">{j.description}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(Number.parseFloat(j.totalDebit), j.transactionCurrency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusTone(j.status)} className="rounded-full text-[10px]">
                          {j.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {j.createdByName ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/accounting/journals/${j.id}`}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          Open <ArrowRight className="ml-1.5 size-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
