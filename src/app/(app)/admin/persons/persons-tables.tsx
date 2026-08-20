'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { GitMerge } from 'lucide-react';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import type { Person } from '@/lib/db/schema/persons';

const activeColumns: ColumnDef<Person>[] = [
  {
    header: 'Name',
    accessorKey: 'firstName',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {row.original.firstName} {row.original.lastName}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.original.email ?? row.original.phone ?? '—'}
        </span>
      </div>
    ),
  },
  {
    header: 'Location',
    id: 'location',
    size: 160,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {[row.original.currentCity, row.original.currentCountry].filter(Boolean).join(', ') || '—'}
      </span>
    ),
  },
  {
    header: 'Source',
    accessorKey: 'source',
    size: 140,
    cell: ({ row }) => (
      <Badge variant="secondary" className="rounded-full text-[10px]">
        {(row.original.source ?? 'DIRECT').replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    header: 'Added',
    accessorKey: 'createdAt',
    size: 140,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
      </span>
    ),
  },
];

export function ActivePersonsTable({ persons }: { persons: Person[] }) {
  return (
    <DataTable
      columns={activeColumns}
      data={persons}
      emptyTitle="No persons yet"
      emptyDescription="Every human in the system appears here — added via Leads, Prospects, or Immigration cases."
    />
  );
}

type MergedRow = Person & { survivorName: string | null };

const mergedColumns: ColumnDef<MergedRow>[] = [
  {
    header: 'Merged loser',
    accessorKey: 'firstName',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {row.original.firstName} {row.original.lastName}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.original.email ?? row.original.phone ?? '—'}
        </span>
      </div>
    ),
  },
  {
    header: 'Merged into',
    accessorKey: 'survivorName',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <GitMerge className="size-3.5 text-muted-foreground" />
        {row.original.survivorName ?? row.original.mergedIntoPersonId?.slice(0, 8)}
      </span>
    ),
  },
  {
    header: 'Merged at',
    accessorKey: 'mergedAt',
    size: 160,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.mergedAt
          ? formatDistanceToNow(row.original.mergedAt, { addSuffix: true })
          : '—'}
      </span>
    ),
  },
];

export function MergedPersonsTable({ persons }: { persons: MergedRow[] }) {
  return (
    <DataTable
      columns={mergedColumns}
      data={persons}
      emptyTitle="No merges yet"
      emptyDescription="Merged loser records preserve audit history — nothing is deleted."
    />
  );
}
