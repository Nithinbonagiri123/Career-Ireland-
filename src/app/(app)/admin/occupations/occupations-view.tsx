'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Occupation, OccupationCategory } from '@/lib/db/schema/occupations';
import { setCategoryActiveAction, setOccupationActiveAction } from '@/modules/occupations/actions';
import type { CategoryWithCount } from '@/modules/occupations/repository';
import { CategoryDialog } from './category-dialog';
import { OccupationDialog } from './occupation-dialog';

type OccupationRow = Occupation & { categoryName: string };

type Props = {
  categories: CategoryWithCount[];
  occupations: OccupationRow[];
};

export function OccupationsView({ categories, occupations }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const activeCategoriesForDialog = useMemo(
    () => categories.filter((c) => c.isActive || selectedCategory === c.id),
    [categories, selectedCategory],
  );

  const filteredOccupations = useMemo(
    () =>
      selectedCategory === 'ALL'
        ? occupations
        : occupations.filter((o) => o.categoryId === selectedCategory),
    [occupations, selectedCategory],
  );

  const toggleCategory = (c: OccupationCategory) => {
    setBusy(c.id);
    startTransition(async () => {
      const result = await setCategoryActiveAction({ id: c.id, isActive: !c.isActive });
      setBusy(null);
      if (result.ok) toast.success(`${c.name} ${c.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(result.error.message);
    });
  };

  const toggleOccupation = (o: Occupation) => {
    setBusy(o.id);
    startTransition(async () => {
      const result = await setOccupationActiveAction({ id: o.id, isActive: !o.isActive });
      setBusy(null);
      if (result.ok) toast.success(`${o.name} ${o.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(result.error.message);
    });
  };

  const categoryColumns: ColumnDef<CategoryWithCount>[] = [
    {
      header: 'Category',
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      header: 'Occupations',
      accessorKey: 'occupationCount',
      size: 120,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.occupationCount}</span>
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
            onClick={() => toggleCategory(row.original)}
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

  const occupationColumns: ColumnDef<OccupationRow>[] = [
    {
      header: 'Occupation',
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      header: 'Category',
      accessorKey: 'categoryName',
      size: 180,
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full">
          {row.original.categoryName}
        </Badge>
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
            onClick={() => toggleOccupation(row.original)}
          >
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <OccupationDialog
            categories={categories}
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
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Categories
          </h2>
          <CategoryDialog
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 size-4" /> New category
              </Button>
            }
          />
        </div>
        <DataTable
          columns={categoryColumns}
          data={categories}
          emptyTitle="No categories yet"
          emptyDescription="Add a top-level occupation category (e.g. Drivers, Construction)."
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Occupations
          </h2>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <OccupationDialog
              categories={activeCategoriesForDialog}
              defaultCategoryId={selectedCategory === 'ALL' ? undefined : selectedCategory}
              trigger={
                <Button size="sm" disabled={categories.length === 0}>
                  <Plus className="mr-1.5 size-4" /> New occupation
                </Button>
              }
            />
          </div>
        </div>
        <DataTable
          columns={occupationColumns}
          data={filteredOccupations}
          emptyTitle={
            categories.length === 0 ? 'Add a category first' : 'No occupations in this category yet'
          }
          emptyDescription={
            categories.length === 0
              ? 'Categories group occupations for search and matching.'
              : 'Add specific occupations under the selected category.'
          }
        />
      </section>
    </div>
  );
}
