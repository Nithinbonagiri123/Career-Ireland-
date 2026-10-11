import { Building2, type FileSpreadsheet, Receipt, Wallet } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
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
import { fetchApAging, listSupplierBills, listSuppliers } from '@/modules/ap/service';

export const dynamic = 'force-dynamic';

/**
 * AP hub — four cards + aging snapshot. Deliberately a single page
 * rather than a sub-tree so finance can see suppliers, bills, aging in
 * one view when reviewing the end-of-month position.
 */
export default async function ApHubPage() {
  await requirePermission('main', 'accounting', 'view');

  const [suppliers, bills, aging] = await Promise.all([
    listSuppliers(),
    listSupplierBills(),
    fetchApAging(),
  ]);

  const outstanding = bills.filter((b) => b.status === 'POSTED' || b.status === 'PARTIALLY_PAID');
  const overdueBuckets = aging.filter((b) => b.label !== 'Current');

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Wallet}
          badge="Accounting · AP"
          title="Accounts Payable"
          description="Supplier master, bills, and bill payments. Every bill emits a shadow-ledger event; the drain posts DR Expense (per bill) / DR VAT Recoverable / CR Accounts Payable; payments post DR AP / CR Bank."
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'AP' },
          ]}
        />
      </FadeUp>

      <FadeUp
        delay={0.05}
        className="mt-6 mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label="Suppliers"
          value={suppliers.filter((s) => s.isActive).length.toString()}
          hint={`${suppliers.length} total`}
        />
        <StatCard
          label="Open bills"
          value={outstanding.length.toString()}
          hint={`${bills.length} all-time`}
        />
        <StatCard
          label="Overdue"
          value={overdueBuckets.reduce((n, b) => n + b.billCount, 0).toString()}
          hint="past due date"
          tone={overdueBuckets.length > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Aging buckets"
          value={aging.length.toString()}
          hint="distinct currency / overdue combos"
        />
      </FadeUp>

      <FadeUp delay={0.1} className="space-y-5">
        <HubCard
          icon={Building2}
          href="/admin/accounting/ap/suppliers"
          title="Suppliers"
          description={`Supplier master — ${suppliers.length} record${suppliers.length === 1 ? '' : 's'}. Add new vendors, edit payment terms, deactivate.`}
        />
        <HubCard
          icon={Receipt}
          href="/admin/accounting/ap/bills"
          title="Bills"
          description="Vendor invoices received. Each posts an Expense + VAT journal and sits in AP until paid. Clicking in opens the detail + record-payment flow."
        />

        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider">AP aging</h2>
            {aging.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No outstanding bills.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="w-24">Ccy</TableHead>
                    <TableHead className="w-24 text-right">Bills</TableHead>
                    <TableHead className="w-36 text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aging.map((b) => (
                    <TableRow key={`${b.label}-${b.currencyCode}`}>
                      <TableCell className="text-sm">{b.label}</TableCell>
                      <TableCell className="font-mono text-xs">{b.currencyCode}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {b.billCount}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {b.outstandingAmount}
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

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground';
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function HubCard({
  icon: Icon,
  href,
  title,
  description,
}: {
  icon: typeof FileSpreadsheet;
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardContent className="flex items-start gap-4 pt-5">
        <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-md bg-muted/60">
          <Icon className="size-5" />
        </span>
        <div className="flex-1">
          <a href={href} className="text-base font-semibold hover:underline">
            {title}
          </a>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
