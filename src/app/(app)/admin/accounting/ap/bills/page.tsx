import { ArrowRight, Plus, Receipt } from 'lucide-react';
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
import { fetchChartOfAccounts } from '@/modules/accounting/read';
import { listSupplierBills, listSuppliers } from '@/modules/ap/service';
import { ACC_CRUMBS, ACC_PAGE, formatDay } from '../../accounting-ui';
import { BillDialog } from './bill-dialog';

export const dynamic = 'force-dynamic';

export default async function BillsListPage() {
  await requirePermission('main', 'accounting', 'view');

  const [bills, suppliers, allAccounts] = await Promise.all([
    listSupplierBills(),
    listSuppliers(),
    fetchChartOfAccounts(),
  ]);

  // Only EXPENSE / COST_OF_SALES / OTHER_EXPENSE accounts are postable
  // as a bill's expense account.
  const expenseAccounts = allAccounts
    .filter(
      (a) =>
        ['EXPENSE', 'COST_OF_SALES', 'OTHER_EXPENSE'].includes(a.type) &&
        a.active &&
        a.allowPosting,
    )
    .map((a) => ({ code: a.code, name: a.name }));

  const activeSuppliers = suppliers
    .filter((s) => s.isActive)
    .map((s) => ({
      id: s.id,
      legalName: s.legalName,
      currencyCode: s.currencyCode,
      paymentTermsDays: s.paymentTermsDays,
    }));

  const openLink = (id: string, number: string) => (
    <Link
      href={`/admin/accounting/ap/bills/${id}`}
      aria-label={`Open bill ${number}`}
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
    >
      Open <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
    </Link>
  );

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Receipt}
          iconTone="pink"
          title="Supplier bills"
          description={`${bills.length} bill${bills.length === 1 ? '' : 's'}. Each bill posts to Expense, VAT recoverable and Accounts payable automatically.`}
          breadcrumbs={[
            ...ACC_CRUMBS,
            { label: 'AP', href: '/admin/accounting/ap' },
            { label: 'Bills' },
          ]}
          action={
            <BillDialog
              suppliers={activeSuppliers}
              expenseAccounts={expenseAccounts}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" aria-hidden /> New bill
                </Button>
              }
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        {bills.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyState
              icon={Receipt}
              title="No bills yet"
              description="Record a supplier bill to see it here with its ledger journal. Add a supplier first if none exist."
            />
          </div>
        ) : (
          <ResponsiveTable
            table={
              <DsTable label="Supplier bills table" caption="Supplier bills" minWidth={860}>
                <DsTHead>
                  <tr>
                    <DsTh className="w-36">Number</DsTh>
                    <DsTh>Supplier</DsTh>
                    <DsTh className="w-28">Date</DsTh>
                    <DsTh className="w-28">Due</DsTh>
                    <DsTh numeric className="w-32">
                      Total
                    </DsTh>
                    <DsTh numeric className="w-32">
                      Paid
                    </DsTh>
                    <DsTh className="w-32">Status</DsTh>
                    <DsActionsTh />
                  </tr>
                </DsTHead>
                <DsTBody>
                  {bills.map((b) => (
                    <DsTr key={b.id}>
                      <DsTd className="whitespace-nowrap font-mono text-xs">{b.number}</DsTd>
                      <DsTd>
                        <div className="text-foreground">{b.supplierName}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{b.description}</div>
                      </DsTd>
                      <DsTd className="whitespace-nowrap text-xs tabular-nums">
                        {formatDay(b.billDate)}
                      </DsTd>
                      <DsTd className="whitespace-nowrap text-xs tabular-nums">
                        {formatDay(b.dueDate)}
                      </DsTd>
                      <DsTd numeric>
                        <Money amount={b.totalAmount} currency={b.currencyCode} />
                      </DsTd>
                      <DsTd numeric className="text-muted-foreground">
                        <Money amount={b.paidAmount} currency={b.currencyCode} />
                      </DsTd>
                      <DsTd>
                        <FinanceStatusPill kind="bill" status={b.status} />
                      </DsTd>
                      <DsTd className="py-2 text-right">{openLink(b.id, b.number)}</DsTd>
                    </DsTr>
                  ))}
                </DsTBody>
              </DsTable>
            }
            cards={
              <DsCardList label="Supplier bills">
                {bills.map((b) => (
                  <DsCardItem key={b.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-foreground">{b.number}</span>
                      <FinanceStatusPill kind="bill" status={b.status} />
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{b.supplierName}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {b.description}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="text-right font-semibold text-foreground">
                        <Money amount={b.totalAmount} currency={b.currencyCode} />
                      </dd>
                      <dt className="text-muted-foreground">Paid</dt>
                      <dd className="text-right">
                        <Money amount={b.paidAmount} currency={b.currencyCode} />
                      </dd>
                      <dt className="text-muted-foreground">Due</dt>
                      <dd className="text-right tabular-nums">{formatDay(b.dueDate)}</dd>
                    </dl>
                    <div className="mt-2 flex justify-end">{openLink(b.id, b.number)}</div>
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
