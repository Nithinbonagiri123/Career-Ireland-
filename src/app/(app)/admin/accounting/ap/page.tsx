import { AlarmClock, Building2, Layers, Receipt, Wallet } from 'lucide-react';
import { DsTable, DsTBody, DsTd, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { Money } from '@/components/ds/money';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchApAging, listSupplierBills, listSuppliers } from '@/modules/ap/service';
import { ACC_CRUMBS, ACC_PAGE, COL_SM, EmptyLine, FLUSH_TABLE, HubCard } from '../accounting-ui';

export const dynamic = 'force-dynamic';

/**
 * AP hub — counts, links to suppliers and bills, and the aging snapshot
 * on one page so finance can review the month-end position at a glance.
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
  const overdueBills = overdueBuckets.reduce((n, b) => n + b.billCount, 0);
  const activeSuppliers = suppliers.filter((s) => s.isActive).length;

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Wallet}
          iconTone="pink"
          title="Accounts Payable"
          description="Suppliers, bills and bill payments. Each bill posts to Expense, VAT recoverable and Accounts payable; each payment reduces Accounts payable against Bank."
          breadcrumbs={[...ACC_CRUMBS, { label: 'AP' }]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mb-5">
        <StatTileGrid>
          <StatTile
            icon={Building2}
            label="Suppliers"
            value={activeSuppliers}
            hint={`${suppliers.length} in total`}
          />
          <StatTile
            icon={Receipt}
            tone="violet"
            label="Open bills"
            value={outstanding.length}
            hint={`${bills.length} bill${bills.length === 1 ? '' : 's'} in total`}
          />
          <StatTile
            icon={AlarmClock}
            tone={overdueBills > 0 ? 'amber' : 'slate'}
            label="Overdue"
            value={overdueBills}
            hint="Past their due date"
          />
          <StatTile
            icon={Layers}
            tone="slate"
            label="Aging buckets"
            value={aging.length}
            hint="By currency and days overdue"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.1} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HubCard
            icon={Building2}
            href="/admin/accounting/ap/suppliers"
            title="Suppliers"
            description="Add suppliers, edit payment terms and deactivate old ones."
            count={`${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}`}
          />
          <HubCard
            icon={Receipt}
            tone="violet"
            href="/admin/accounting/ap/bills"
            title="Bills"
            description="Supplier invoices received. Open a bill to see its payments and record a new one."
            count={`${bills.length} bill${bills.length === 1 ? '' : 's'}`}
          />
        </div>

        <SectionCard title="AP aging" bodyClassName="mt-3">
          {aging.length === 0 ? (
            <EmptyLine>No outstanding bills.</EmptyLine>
          ) : (
            <DsTable
              label="AP aging table"
              caption="Outstanding bills by age and currency"
              card={false}
              minWidth={300}
              className={FLUSH_TABLE}
            >
              <DsTHead>
                <tr>
                  <DsTh>Bucket</DsTh>
                  <DsTh className={cn('w-24', COL_SM)}>Currency</DsTh>
                  <DsTh numeric className="w-24">
                    Bills
                  </DsTh>
                  <DsTh numeric className="w-40">
                    Outstanding
                  </DsTh>
                </tr>
              </DsTHead>
              <DsTBody>
                {aging.map((b) => (
                  <DsTr key={`${b.label}-${b.currencyCode}`}>
                    <DsTd className="text-foreground">{b.label}</DsTd>
                    <DsTd className={cn('font-mono text-xs', COL_SM)}>{b.currencyCode}</DsTd>
                    <DsTd numeric>{b.billCount}</DsTd>
                    <DsTd numeric className="font-medium">
                      <Money amount={b.outstandingAmount} currency={b.currencyCode} />
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
