import { Building2, Pencil, Plus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
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
import { listSuppliers } from '@/modules/ap/service';
import { SupplierDialog } from './supplier-dialog';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  await requirePermission('main', 'accounting', 'view');
  const suppliers = await listSuppliers();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          badge="Accounting · AP"
          title="Suppliers"
          description={`${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}. Add new vendors here; bills reference them via supplier_id.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'AP', href: '/admin/accounting/ap' },
            { label: 'Suppliers' },
          ]}
          action={
            <SupplierDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" /> Add supplier
                </Button>
              }
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6">
        <Card>
          <CardContent className="pt-5">
            {suppliers.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No suppliers yet"
                description="Add the first supplier to start raising bills. The AP ledger needs a supplier record on every bill — there is no 'walk-in' supplier."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-28">Country</TableHead>
                    <TableHead className="w-20">Ccy</TableHead>
                    <TableHead className="w-24 text-right">Terms</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-20 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{s.legalName}</div>
                        {s.tradingName && (
                          <div className="text-xs text-muted-foreground">
                            Trading as {s.tradingName}
                          </div>
                        )}
                        {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.country ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{s.currencyCode ?? '—'}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {s.paymentTermsDays}d
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.isActive ? 'default' : 'outline'}
                          className="rounded-full text-[10px]"
                        >
                          {s.isActive ? 'active' : 'inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <SupplierDialog
                          initial={s}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Edit ${s.legalName}`}>
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
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
