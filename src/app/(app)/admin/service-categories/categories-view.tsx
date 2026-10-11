'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import type { ServiceCategory } from '@/lib/db/schema/services';
import { setServiceCategoryActiveAction } from '@/modules/services-catalog/actions';
import { CategoryDialog } from './category-dialog';

/**
 * Inline-CRUD view for business-line categories. The surface is tiny
 * (categories are expected to be a short list for the lifetime of the
 * business), so no pagination, no search — just a flat table with
 * add/edit/activate-toggle controls.
 */
export function CategoriesView({ categories }: { categories: ServiceCategory[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (c: ServiceCategory) => {
    setBusy(c.id);
    startTransition(async () => {
      const r = await setServiceCategoryActiveAction({ id: c.id, isActive: !c.isActive });
      setBusy(null);
      if (r.ok) toast.success(`${c.name} ${c.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<ServiceCategory>[] = [
    {
      header: 'Order',
      accessorKey: 'displayOrder',
      size: 70,
      cell: ({ row }) => (
        <span className="tabular-nums text-xs text-muted-foreground">
          {row.original.displayOrder}
        </span>
      ),
    },
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{row.original.slug}</span>
        </div>
      ),
    },
    {
      header: 'Description',
      accessorKey: 'description',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.description ?? '—'}</span>
      ),
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
            onClick={() => toggle(row.original)}
          >
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <CategoryDialog
            initial={row.original}
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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Categories
        </h2>
        <CategoryDialog
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-4" /> New category
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={categories}
        emptyTitle="No categories yet"
        emptyDescription="Add Candidate services, Recruitment, Immigration — or any other line of business — so Tracey can tag services from this page."
      />
    </section>
  );
}
