'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, MoreHorizontal, Pencil } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { archiveCommunicationAction } from '@/modules/activities/actions';
import type { CommunicationRow } from '@/modules/activities/service';
import { EditCommDialog } from './edit-comm-dialog';

export function CommsTable({ comms }: { comms: CommunicationRow[] }) {
  const [editTarget, setEditTarget] = useState<CommunicationRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CommunicationRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await archiveCommunicationAction({
        communicationId: target.id,
        reason,
      });
      setBusy(null);
      if (r.ok) {
        toast.success('Communication archived');
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns = useMemo<ColumnDef<CommunicationRow>[]>(
    () => [
      {
        header: 'When',
        accessorKey: 'occurredAt',
        size: 140,
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground"
            title={row.original.occurredAt.toLocaleString()}
          >
            {formatDistanceToNow(row.original.occurredAt, { addSuffix: true })}
          </span>
        ),
      },
      {
        header: 'Type',
        accessorKey: 'type',
        size: 130,
        cell: ({ row }) => (
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {row.original.type.replace(/_/g, ' ')} · {row.original.direction}
          </Badge>
        ),
      },
      {
        header: 'Subject',
        accessorKey: 'subject',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium">{row.original.subject ?? '(no subject)'}</span>
            {row.original.body && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {row.original.body}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Staff',
        accessorKey: 'staffName',
        size: 150,
        cell: ({ row }) => <span className="text-xs">{row.original.staffName}</span>,
      },
      {
        header: 'Follow-up',
        accessorKey: 'followUpRequired',
        size: 120,
        cell: ({ row }) =>
          row.original.followUpRequired ? (
            <Badge variant="default" className="rounded-full text-[10px]">
              Required
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        header: '',
        id: 'actions',
        size: 50,
        cell: ({ row }) => {
          const c = row.original;
          const isBusy = busy === c.id;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Actions" disabled={isBusy} />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditTarget(c)}>
                  <Pencil className="mr-2 size-4" /> Edit…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(c)}>
                  <Archive className="mr-2 size-4" /> Archive…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [busy],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={comms}
        emptyTitle="No communications logged"
        emptyDescription="Every email, call, meeting, and note lives here — attached to the person, employer, requisition, engagement, or case it relates to."
      />
      <EditCommDialog
        comm={editTarget}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null);
        }}
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title="Archive communication?"
        description="Archived communications are hidden from the list. The row + audit trail stay."
        label="Reason (audited)"
        placeholder="e.g. Logged in error, duplicate"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busy === archiveTarget?.id}
      />
    </>
  );
}
