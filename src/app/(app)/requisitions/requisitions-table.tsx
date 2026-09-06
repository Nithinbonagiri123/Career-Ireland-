'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArrowRight, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { archiveRequisitionAction } from '@/modules/requisitions/actions';
import type { RequisitionListRow } from '@/modules/requisitions/service';

const STATUS_VARIANT: Record<RequisitionListRow['status'], 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  OPEN: 'default',
  IN_PROGRESS: 'default',
  PARTIALLY_FILLED: 'secondary',
  FILLED: 'outline',
  CLOSED: 'outline',
  CANCELLED: 'outline',
};

export function RequisitionsTable({ requisitions }: { requisitions: RequisitionListRow[] }) {
  const [archiveTarget, setArchiveTarget] = useState<RequisitionListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archiveRequisitionAction({ requisitionId: target.id, reason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.title} archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns = useMemo<ColumnDef<RequisitionListRow>[]>(
    () => [
      {
        header: 'Title',
        accessorKey: 'title',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium">{row.original.title}</span>
            <span className="text-xs text-muted-foreground">{row.original.employerName}</span>
          </div>
        ),
      },
      {
        header: 'Positions',
        id: 'positions',
        size: 110,
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.positionsFilled} / {row.original.positionsRequired}
          </span>
        ),
      },
      {
        header: 'Type',
        accessorKey: 'employmentType',
        size: 120,
        cell: ({ row }) => (
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {row.original.employmentType.replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 140,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
            {row.original.status.replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        size: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
          </span>
        ),
      },
      {
        header: '',
        id: 'actions',
        size: 130,
        cell: ({ row }) => {
          const r = row.original;
          const isBusy = busyId === r.id;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Link
                href={`/requisitions/${r.id}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Open <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Actions" disabled={isBusy} />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem render={<Link href={`/requisitions/${r.id}`} />}>
                    Open detail
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(r)}>
                    <Archive className="mr-2 size-4" /> Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [busyId],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={requisitions}
        emptyTitle="No requisitions yet"
        emptyDescription="Every recruitment engagement starts with a Job Requisition from an Employer."
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive "${archiveTarget?.title ?? ''}"?`}
        description="Archived requisitions are hidden from lists, matching, and dashboards. They can be restored later. This is not a delete — audit history is preserved."
        label="Reason (audited)"
        placeholder="e.g. Employer closed the vacancy, duplicate posting"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
    </>
  );
}
