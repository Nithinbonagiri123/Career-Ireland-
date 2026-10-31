import { CircleDollarSign, Clock3, Plus, Receipt, Wallet } from 'lucide-react';
import { notFound } from 'next/navigation';
import { DsTable, DsTBody, DsTd, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { DocumentHeader } from '@/components/ds/document-header';
import { FinanceStatusPill } from '@/components/ds/finance-status';
import { formatMoney, Money } from '@/components/ds/money';
import { StatTile } from '@/components/ds/stat-tile';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Button } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchBillDetail } from '@/modules/ap/service';
import {
  ACC_CRUMBS,
  ACC_PAGE,
  COL_MD,
  COL_SM,
  EmptyLine,
  FLUSH_TABLE,
  formatDay,
  formatStamp,
  PHONE_NOTE,
} from '../../../accounting-ui';
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

  const meta = [
    <span key="desc" className="text-sm text-foreground">
      {bill.description}
    </span>,
    <span key="supplier">
      Supplier <strong className="text-foreground">{bill.supplierName}</strong>
      {bill.supplierReference && (
        <>
          {' · '}Their ref <strong className="text-foreground">{bill.supplierReference}</strong>
        </>
      )}
    </span>,
    <span key="dates">
      Bill date <strong className="text-foreground">{formatDay(bill.billDate)}</strong>
      {' · '}Due <strong className="text-foreground">{formatDay(bill.dueDate)}</strong>
      {' · '}Expense account <strong className="text-foreground">{bill.expenseAccountCode}</strong>
    </span>,
  ];

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <DocumentHeader
          breadcrumbs={[
            ...ACC_CRUMBS,
            { label: 'AP', href: '/admin/accounting/ap' },
            { label: 'Bills', href: '/admin/accounting/ap/bills' },
            { label: bill.number },
          ]}
          icon={Receipt}
          tone="rose"
          kind="Bill"
          number={bill.number}
          status={<FinanceStatusPill kind="bill" status={bill.status} />}
          meta={meta}
          actions={
            canPay ? (
              <BillPaymentDialog
                billId={bill.id}
                outstanding={outstanding}
                currencyCode={bill.currencyCode}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" aria-hidden /> Record payment
                  </Button>
                }
              />
            ) : null
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={CircleDollarSign}
          label="Total"
          value={<Money amount={bill.totalAmount} currency={bill.currencyCode} />}
          hint={`Net ${formatMoney(bill.subtotal, bill.currencyCode)} + VAT ${formatMoney(bill.taxAmount, bill.currencyCode)}`}
        />
        <StatTile
          icon={Wallet}
          tone="green"
          label="Paid"
          value={<Money amount={paidCents / 100} currency={bill.currencyCode} />}
          hint={`${payments.length} payment${payments.length === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={Clock3}
          tone={outstandingCents > 0 ? 'amber' : 'slate'}
          label="Outstanding"
          value={<Money amount={outstandingCents / 100} currency={bill.currencyCode} />}
        />
      </FadeUp>

      <FadeUp delay={0.1} className="mt-4">
        <SectionCard title="Payments" count={payments.length} bodyClassName="mt-3">
          {payments.length === 0 ? (
            <EmptyLine>No payments recorded against this bill yet.</EmptyLine>
          ) : (
            <DsTable
              label="Bill payments table"
              caption={`Payments against bill ${bill.number}`}
              card={false}
              minWidth={300}
              className={FLUSH_TABLE}
            >
              <DsTHead>
                <tr>
                  <DsTh className="w-28">Date</DsTh>
                  <DsTh className={cn('w-32', COL_SM)}>Method</DsTh>
                  <DsTh className={COL_MD}>Reference</DsTh>
                  <DsTh numeric className="w-32">
                    Amount
                  </DsTh>
                  <DsTh className={cn('w-40', COL_SM)}>Recorded</DsTh>
                </tr>
              </DsTHead>
              <DsTBody>
                {payments.map((p) => (
                  <DsTr key={p.id}>
                    <DsTd className="text-xs tabular-nums">
                      <div className="whitespace-nowrap text-foreground">
                        {formatDay(p.paymentDate)}
                      </div>
                      <div className={PHONE_NOTE}>
                        <span className="capitalize">
                          {p.method.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        {p.reference ? ` · ${p.reference}` : ''}
                        <br />
                        Recorded {formatStamp(p.createdAt)}
                      </div>
                    </DsTd>
                    <DsTd className={cn('text-xs capitalize', COL_SM)}>
                      {p.method.replace(/_/g, ' ').toLowerCase()}
                    </DsTd>
                    <DsTd className={cn('text-xs text-muted-foreground', COL_MD)}>
                      {p.reference ?? '—'}
                    </DsTd>
                    <DsTd numeric>
                      <Money amount={p.amount} currency={p.currencyCode} />
                    </DsTd>
                    <DsTd
                      className={cn(
                        'whitespace-nowrap text-xs tabular-nums text-muted-foreground',
                        COL_SM,
                      )}
                    >
                      <time dateTime={p.createdAt.toISOString()}>{formatStamp(p.createdAt)}</time>
                    </DsTd>
                  </DsTr>
                ))}
              </DsTBody>
            </DsTable>
          )}
        </SectionCard>
      </FadeUp>
    </div>
  );
}
