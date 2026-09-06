'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Currency } from '@/lib/db/schema/currencies';
import type { ServiceCatalogItem, ServicePackage } from '@/lib/db/schema/services';
import {
  setServiceItemActiveAction,
  setServicePackageActiveAction,
} from '@/modules/services-catalog/actions';
import { ServiceItemDialog } from './service-item-dialog';
import { ServicePackageDialog } from './service-package-dialog';

type Props = {
  services: ServiceCatalogItem[];
  packages: ServicePackage[];
  currencies: Currency[];
};

const PAYER_LABEL: Record<ServiceCatalogItem['payerType'], string> = {
  PERSON: 'Person',
  EMPLOYER: 'Employer',
  ANY: 'Either',
};

export function ServicesView({ services, packages, currencies }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const currencyByCode = useMemo(() => new Map(currencies.map((c) => [c.code, c])), [currencies]);

  const toggleService = (s: ServiceCatalogItem) => {
    setBusy(s.id);
    startTransition(async () => {
      const r = await setServiceItemActiveAction({ id: s.id, isActive: !s.isActive });
      setBusy(null);
      if (r.ok) toast.success(`${s.name} ${s.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(r.error.message);
    });
  };

  const togglePackage = (p: ServicePackage) => {
    setBusy(p.id);
    startTransition(async () => {
      const r = await setServicePackageActiveAction({ id: p.id, isActive: !p.isActive });
      setBusy(null);
      if (r.ok) toast.success(`${p.name} ${p.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(r.error.message);
    });
  };

  const serviceColumns: ColumnDef<ServiceCatalogItem>[] = [
    {
      header: 'Code',
      accessorKey: 'code',
      size: 140,
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold">{row.original.code}</span>
      ),
    },
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
    },
    {
      header: 'Payer',
      accessorKey: 'payerType',
      size: 100,
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full">
          {PAYER_LABEL[row.original.payerType]}
        </Badge>
      ),
    },
    {
      header: 'Default price',
      id: 'defaultPrice',
      size: 140,
      cell: ({ row }) => {
        const s = row.original;
        if (!s.defaultPrice || !s.defaultCurrencyCode) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const sym = currencyByCode.get(s.defaultCurrencyCode)?.symbol ?? s.defaultCurrencyCode;
        return (
          <span className="text-xs">
            {sym}
            {s.defaultPrice}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-status-success" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Inactive
          </span>
        ),
    },
    {
      header: '',
      id: 'actions',
      size: 200,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy === row.original.id}
            onClick={() => toggleService(row.original)}
          >
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <ServiceItemDialog
            initial={row.original}
            currencies={currencies}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.code}`}>
                <Pencil className="size-3.5" />
              </Button>
            }
          />
        </div>
      ),
    },
  ];

  const packageColumns: ColumnDef<ServicePackage>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      header: 'Service',
      accessorKey: 'serviceCatalogItemId',
      size: 200,
      cell: ({ row }) => {
        const s = serviceById.get(row.original.serviceCatalogItemId);
        return (
          <Badge variant="secondary" className="rounded-full">
            {s?.name ?? '—'}
          </Badge>
        );
      },
    },
    {
      header: 'Price',
      id: 'price',
      size: 140,
      cell: ({ row }) => {
        const sym =
          currencyByCode.get(row.original.currencyCode)?.symbol ?? row.original.currencyCode;
        return (
          <span className="text-sm">
            {sym}
            {row.original.price}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-status-success" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Inactive
          </span>
        ),
    },
    {
      header: '',
      id: 'actions',
      size: 200,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy === row.original.id}
            onClick={() => togglePackage(row.original)}
          >
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <ServicePackageDialog
            initial={row.original}
            services={services}
            currencies={currencies}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.name}`}>
                <Pencil className="size-3.5" />
              </Button>
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Services
          </h2>
          <ServiceItemDialog
            currencies={currencies}
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 size-4" /> New service
              </Button>
            }
          />
        </div>
        <DataTable
          columns={serviceColumns}
          data={services}
          emptyTitle="No services yet"
          emptyDescription="Add services Career Ireland sells (Job Search, Employment Permit, Visa…)."
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Packages
          </h2>
          <ServicePackageDialog
            services={services.filter((s) => s.isActive)}
            currencies={currencies}
            trigger={
              <Button size="sm" disabled={services.length === 0}>
                <Plus className="mr-1.5 size-4" /> New package
              </Button>
            }
          />
        </div>
        <DataTable
          columns={packageColumns}
          data={packages}
          emptyTitle={services.length === 0 ? 'Add a service first' : 'No packages yet'}
          emptyDescription="Packages bundle a service at a specific price (Basic / Standard / Premium)."
        />
      </section>
    </div>
  );
}
