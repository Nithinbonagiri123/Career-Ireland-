import { format, formatDistanceToNow } from 'date-fns';
import { Plus, Receipt } from 'lucide-react';
import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { fetchBillDetail } from '@/modules/ap/service';
import { BillPaymentDialog } from './payment-dialog';

export const dynamic = 'force-dynamic';

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('main', 'accounting', 'view');
  const { id } = await params;
  const detail = await fetchBillDetail(id);
  if (!detail) notFound();
  const { bill, payments } = detail;

  const totalCents = Math.round(Number.parseFloat(bill.totalAmount) * 100);
  const paidCents = payments.reduce((s, p) => s + Math.round(Number.parseFloat(p.amount) * 100), 0);
  const outstandingCents = Math.max(totalCents - paidCents, 0);
  const outstanding = (outstandingCents / 100).toFixed(2);

  const canPay =
    (bill.status === 'POSTED' || bill.status === 'PARTIALLY_PAID') && outstandingCents > 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Receipt}
          badge="Bill"
          title={bill.number}
          description={bill.description}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'AP', href: '/admin/accounting/ap' },
            { label: 'Bills', href: '/admin/accounting/ap/bills' },
            { label: bill.number },
          ]}
          meta={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <Badge variant={statusTone(bill.status)} className="rounded-full">
                {bill.status}
              </Badge>
              <span>
                Supplier <strong className="text-foreground">{bill.supplierName}</strong>
              </span>
              <span>
                Bill date <strong className="text-foreground">{bill.billDate}</strong>
              </span>
              <span>
                Due <strong className="text-foreground">{bill.dueDate}</strong>
              </span>
              <span>
                Expense acct <strong className="text-foreground">{bill.expenseAccountCode}</strong>
              </span>
              {bill.supplierReference && (
                <span>
                  Supplier ref <strong className="text-foreground">{bill.supplierReference}</strong>
                </span>
              )}
            </div>
          }
          action={
            canPay ? (
              <BillPaymentDialog
                billId={bill.id}
                outstanding={outstanding}
                currencyCode={bill.currencyCode}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> Record payment
                  </Button>
                }
              />
            ) : null
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatCurrency(Number.parseFloat(bill.totalAmount), bill.currencyCode)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Net {bill.subtotal} + VAT {bill.taxAmount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Paid
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(paidCents / 100, bill.currencyCode)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {payments.length} payment{payments.length === 1 ? '' : 's'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Outstanding
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                outstandingCents > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
              }`}
            >
              {formatCurrency(outstandingCents / 100, bill.currencyCode)}
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      {payments.length > 0 && (
        <FadeUp delay={0.1} className="mt-6">
          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">Payments</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-32">Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-40">Recorded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs tabular-nums">{p.paymentDate}</TableCell>
                      <TableCell className="text-xs">{p.method.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.reference ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(Number.parseFloat(p.amount), p.currencyCode)}
                      </TableCell>
                      <TableCell>
                        <time
                          dateTime={p.createdAt.toISOString()}
                          className="text-xs text-muted-foreground"
                          title={format(p.createdAt, 'd MMM yyyy · HH:mm')}
                        >
                          {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                        </time>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </FadeUp>
      )}
    </div>
  );
}
