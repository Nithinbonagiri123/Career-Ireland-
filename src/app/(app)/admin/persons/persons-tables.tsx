'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, GitMerge } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Person } from '@/lib/db/schema/persons';
import { archivePersonAction } from '@/modules/persons/actions';

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
  const [archiveTarget, setArchiveTarget] = useState<Person | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archivePersonAction({ personId: target.id, reason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.firstName} ${target.lastName} archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columnsWithActions: ColumnDef<Person>[] = [
    ...activeColumns,
    {
      header: '',
      id: 'actions',
      size: 60,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Archive ${row.original.firstName} ${row.original.lastName}`}
          disabled={busyId === row.original.id}
          onClick={() => setArchiveTarget(row.original)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Archive className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columnsWithActions}
        data={persons}
        emptyTitle="No persons yet"
        emptyDescription="Every human in the system appears here — added via Leads, Prospects, or Immigration cases."
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive ${archiveTarget?.firstName ?? ''} ${archiveTarget?.lastName ?? ''}?`}
        description="Removes this person from every active list globally (candidates, leads, immigration). Audit history and existing records are preserved. Use Merge instead if this is a duplicate."
        label="Reason (audited)"
        placeholder="e.g. Requested account removal (GDPR)"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
    </>
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
