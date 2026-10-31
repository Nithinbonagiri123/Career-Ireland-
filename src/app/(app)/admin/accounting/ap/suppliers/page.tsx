import { Building2, Pencil, Plus } from 'lucide-react';
import {
  DsActionsTh,
  DsTable,
  DsTBody,
  DsTd,
  DsTHead,
  DsTh,
  DsTr,
} from '@/components/ds/data-table';
import { DsStatusPill } from '@/components/ds/status-pill';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { listSuppliers } from '@/modules/ap/service';
import { ACC_CRUMBS, ACC_PAGE } from '../../accounting-ui';
import { SupplierDialog } from './supplier-dialog';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  await requirePermission('main', 'accounting', 'view');
  const suppliers = await listSuppliers();

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={Building2}
          iconTone="pink"
          title="Suppliers"
          description={`${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}. Every bill needs a supplier, so add new vendors here first.`}
          breadcrumbs={[
            ...ACC_CRUMBS,
            { label: 'AP', href: '/admin/accounting/ap' },
            { label: 'Suppliers' },
          ]}
          action={
            <SupplierDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" aria-hidden /> Add supplier
                </Button>
              }
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        {suppliers.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
            <EmptyState
              icon={Building2}
              title="No suppliers yet"
              description="Add the first supplier to start recording bills."
            />
          </div>
        ) : (
          <DsTable label="Suppliers table" caption="Suppliers" minWidth={640}>
            <DsTHead>
              <tr>
                <DsTh>Name</DsTh>
                <DsTh className="w-24">Country</DsTh>
                <DsTh className="w-24">Currency</DsTh>
                <DsTh numeric className="w-24">
                  Terms
                </DsTh>
                <DsTh className="w-28">Status</DsTh>
                <DsActionsTh />
              </tr>
            </DsTHead>
            <DsTBody>
              {suppliers.map((s) => (
                <DsTr key={s.id}>
                  <DsTd>
                    <div className="font-medium text-foreground">{s.legalName}</div>
                    {s.tradingName && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Trading as {s.tradingName}
                      </div>
                    )}
                    {s.email && (
                      <div className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {s.email}
                      </div>
                    )}
                  </DsTd>
                  <DsTd className="font-mono text-xs">{s.country ?? '—'}</DsTd>
                  <DsTd className="font-mono text-xs">{s.currencyCode ?? '—'}</DsTd>
                  <DsTd numeric className="whitespace-nowrap">
                    {s.paymentTermsDays} days
                  </DsTd>
                  <DsTd>
                    {s.isActive ? (
                      <DsStatusPill tone="green">Active</DsStatusPill>
                    ) : (
                      <DsStatusPill tone="slate">Inactive</DsStatusPill>
                    )}
                  </DsTd>
                  <DsTd className="py-2 text-right">
                    <SupplierDialog
                      initial={s}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Edit ${s.legalName}`}>
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                      }
                    />
                  </DsTd>
                </DsTr>
              ))}
            </DsTBody>
          </DsTable>
        )}
      </FadeUp>
    </div>
  );
}
