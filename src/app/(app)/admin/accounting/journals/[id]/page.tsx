import { format } from 'date-fns';
import { Landmark } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
import { formatCurrency } from '@/lib/currency';
import { statusTone } from '@/lib/ui/status-tone';
import { fetchJournalWithLines } from '@/modules/accounting/read';
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

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Landmark}
          badge="Journal"
          title={header.number}
          description={header.description}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Journals', href: '/admin/accounting/journals' },
            { label: header.number },
          ]}
          meta={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <Badge variant={statusTone(header.status)} className="rounded-full">
                {header.status}
              </Badge>
              <span>
                Journal date <strong className="text-foreground">{header.journalDate}</strong>
              </span>
              <span>
                Posted{' '}
                <strong className="text-foreground">
                  {header.postedAt ? format(header.postedAt, 'd MMM yyyy · HH:mm') : '—'}
                </strong>
              </span>
              <span>
                By <strong className="text-foreground">{header.createdByName ?? '—'}</strong>
              </span>
              <span>
                Currency <strong className="text-foreground">{header.transactionCurrency}</strong>
                {header.transactionCurrency !== header.functionalCurrency && (
                  <>
                    {' '}
                    @ <strong className="text-foreground">{header.exchangeRate}</strong>
                  </>
                )}
              </span>
              {header.reversesJournalId && header.reversesJournalNumber && (
                <span>
                  Reverses{' '}
                  <Link
                    href={`/admin/accounting/journals/${header.reversesJournalId}`}
                    className="font-mono text-foreground underline-offset-2 hover:underline"
                  >
                    {header.reversesJournalNumber}
                  </Link>
                </span>
              )}
            </div>
          }
          action={
            header.status === 'POSTED' ? (
              <ReverseJournalButton journalId={header.id} journalNumber={header.number} />
            ) : null
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-28">Account</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-28">Division</TableHead>
                  <TableHead className="w-28 text-right">Debit</TableHead>
                  <TableHead className="w-28 text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {l.lineNumber}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.accountCode}</TableCell>
                    <TableCell>
                      <div className="text-sm">{l.accountName}</div>
                      {l.description && (
                        <div className="text-xs text-muted-foreground">{l.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.divisionName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {Number.parseFloat(l.debit) > 0
                        ? formatCurrency(Number.parseFloat(l.debit), l.currencyCode)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {Number.parseFloat(l.credit) > 0
                        ? formatCurrency(Number.parseFloat(l.credit), l.currencyCode)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-xs font-semibold uppercase tracking-wider">
                    Totals
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(totalDebit, header.transactionCurrency)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(totalCredit, header.transactionCurrency)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
