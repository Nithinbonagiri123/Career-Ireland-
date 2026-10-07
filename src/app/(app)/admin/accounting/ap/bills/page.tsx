import { format } from 'date-fns';
import { ArrowRight, Plus, Receipt } from 'lucide-react';
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
import { fetchChartOfAccounts } from '@/modules/accounting/read';
import { listSupplierBills, listSuppliers } from '@/modules/ap/service';
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

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Receipt}
          badge="Accounting · AP"
          title="Supplier bills"
          description={`${bills.length} bill${bills.length === 1 ? '' : 's'}. Each posts DR Expense / DR VAT Recoverable / CR Accounts Payable automatically via the shadow-ledger.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'AP', href: '/admin/accounting/ap' },
            { label: 'Bills' },
          ]}
          action={
            <BillDialog
              suppliers={activeSuppliers}
              expenseAccounts={expenseAccounts}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" /> New bill
                </Button>
              }
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            {bills.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No bills yet"
                description="Post a supplier bill to see it show up here with its ledger journal. Add a supplier first if none exist."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Number</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-28">Due</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead className="w-28 text-right">Paid</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-20 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.number}</TableCell>
                      <TableCell>
                        <div className="text-sm">{b.supplierName}</div>
                        <div className="text-xs text-muted-foreground">{b.description}</div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{b.billDate}</TableCell>
                      <TableCell className="text-xs tabular-nums">{b.dueDate}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCurrency(Number.parseFloat(b.totalAmount), b.currencyCode)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(Number.parseFloat(b.paidAmount), b.currencyCode)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusTone(b.status)} className="rounded-full text-[10px]">
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/accounting/ap/bills/${b.id}`}
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
