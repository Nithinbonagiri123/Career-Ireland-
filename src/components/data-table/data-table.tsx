'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  type Row,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  loadingRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
  /** When set, prepend a checkbox column and fire `onSelectionChange` with the selected rows. */
  enableRowSelection?: boolean;
  onSelectionChange?: (rows: TData[]) => void;
  /** Bump this number to force the table to clear its internal selection state. */
  selectionResetKey?: number;
  /**
   * When set, render a search input above the table that filters rows across
   * every column. TanStack's built-in `globalFilter` semantics — matches on
   * String(value).toLowerCase().includes(query.toLowerCase()) by default.
   */
  enableGlobalFilter?: boolean;
  globalFilterPlaceholder?: string;
  /** When set, render a "Columns" dropdown that toggles visibility per column. */
  enableColumnVisibility?: boolean;
  /** Extra content injected on the right side of the toolbar (e.g. per-page action buttons). */
  toolbarRight?: ReactNode;
};

/**
 * Reusable data table. Wraps TanStack Table + shadcn Table with a consistent
 * loading (Skeleton) + empty (EmptyState) + interaction shape.
 *
 * Every list page in this app uses this — never build a bespoke table.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  loadingRows = 6,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  className,
  enableRowSelection,
  onSelectionChange,
  selectionResetKey,
  enableGlobalFilter,
  globalFilterPlaceholder = 'Search…',
  enableColumnVisibility,
  toolbarRight,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columnsWithSelect = useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectCol: ColumnDef<TData, TValue> = {
      id: '__select',
      size: 36,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(v === true)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
    return [selectCol, ...columns];
  }, [enableRowSelection, columns]);

  // Custom global filter. TanStack's default coerces every cell value to
  // string, which is disastrous for Date columns — `String(new Date())`
  // resolves to something like `"… (Irish Standard Time)"`, and every
  // row ends up matching queries like "an" (via "Standard") or "ir"
  // (via "Irish"). Also for status enum columns the raw value is often
  // noisy uppercase text unrelated to what the user sees in the cell.
  //
  // Instead: only match against string / number cell values, ignoring
  // Date, boolean, and object cells. This matches user intent — search
  // as if you were reading the table with your eyes.
  const globalFilterFn = useMemo<FilterFn<TData>>(
    () => (row: Row<TData>, columnId: string, filterValue: unknown) => {
      const value = row.getValue(columnId);
      if (value == null) return false;
      if (value instanceof Date) return false;
      if (typeof value === 'boolean') return false;
      if (typeof value === 'object') return false;
      const haystack = String(value).toLowerCase();
      const needle = String(filterValue ?? '').toLowerCase();
      return needle.length === 0 || haystack.includes(needle);
    },
    [],
  );

  const table = useReactTable({
    data,
    columns: columnsWithSelect,
    state: {
      ...(enableRowSelection ? { rowSelection } : {}),
      ...(enableGlobalFilter ? { globalFilter } : {}),
      ...(enableGlobalFilter ? { columnFilters } : {}),
      ...(enableColumnVisibility ? { columnVisibility } : {}),
    },
    onRowSelectionChange: enableRowSelection ? setRowSelection : undefined,
    onGlobalFilterChange: enableGlobalFilter ? setGlobalFilter : undefined,
    onColumnFiltersChange: enableGlobalFilter ? setColumnFilters : undefined,
    onColumnVisibilityChange: enableColumnVisibility ? setColumnVisibility : undefined,
    enableRowSelection,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel:
      enableGlobalFilter || columnFilters.length > 0 ? getFilteredRowModel() : undefined,
  });

  // Broadcast selection changes upstream. `rowSelection` is the source of truth
  // that this hook observes; `table` is derived from it, so re-running when
  // `rowSelection` changes gives us the fresh selection to publish.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowSelection triggers the recompute
  useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const selected = table.getSelectedRowModel().rows.map((r) => r.original);
    onSelectionChange(selected);
  }, [rowSelection, enableRowSelection, onSelectionChange, table]);

  // Allow caller to force a selection reset.
  useEffect(() => {
    if (selectionResetKey === undefined) return;
    setRowSelection({});
  }, [selectionResetKey]);

  const showToolbar = Boolean(enableGlobalFilter || enableColumnVisibility || toolbarRight);
  // Columns eligible for the visibility toggle — exclude the internal select
  // column, and only include columns with a header string (icon-only columns
  // don't have a display label).
  const toggleableColumns = enableColumnVisibility
    ? table
        .getAllLeafColumns()
        .filter(
          (c) => c.id !== '__select' && typeof c.columnDef.header === 'string' && c.getCanHide(),
        )
    : [];

  const toolbar = showToolbar ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {enableGlobalFilter && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.currentTarget.value)}
              placeholder={globalFilterPlaceholder}
              className="h-8 w-56 pl-8 pr-8 text-sm"
              aria-label="Search rows"
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => setGlobalFilter('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {enableColumnVisibility && toggleableColumns.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="h-8">
                  <SlidersHorizontal className="mr-1.5 size-3.5" />
                  Columns
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {toggleableColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(v) => col.toggleVisibility(v === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {String(col.columnDef.header)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {toolbarRight}
      </div>
    </div>
  ) : null;

  if (!isLoading && data.length === 0 && globalFilter.length === 0) {
    return (
      <div className="space-y-3">
        {toolbar}
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  const filteredRows = table.getRowModel().rows;
  const noResults = !isLoading && filteredRows.length === 0 && data.length > 0;

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar}
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: loadingRows }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no id
                <TableRow key={`sk-${i}`}>
                  {columnsWithSelect.map((_c, ci) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells have no id
                    <TableCell key={`sk-${i}-${ci}`}>
                      <Skeleton className="h-4 w-full max-w-[200px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : noResults ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  No rows match "{globalFilter}"
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
