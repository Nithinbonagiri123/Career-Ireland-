'use client';

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Checkbox } from '@/components/ui/checkbox';
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
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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

  const table = useReactTable({
    data,
    columns: columnsWithSelect,
    state: enableRowSelection ? { rowSelection } : undefined,
    onRowSelectionChange: enableRowSelection ? setRowSelection : undefined,
    enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
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

  if (!isLoading && data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
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
          {isLoading
            ? Array.from({ length: loadingRows }).map((_, i) => (
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
            : table.getRowModel().rows.map((row) => (
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
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
