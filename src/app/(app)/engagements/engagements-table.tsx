'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, MoreHorizontal } from 'lucide-react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { archiveEngagementAction } from '@/modules/commerce/actions';
import type { EngagementListRow } from '@/modules/commerce/repository';

const STATUS_VARIANT: Record<EngagementListRow['status'], 'default' | 'secondary' | 'outline'> = {
  REQUESTED: 'secondary',
  PENDING_PAYMENT: 'secondary',
  ACTIVE: 'default',
  ON_HOLD: 'outline',
  COMPLETED: 'outline',
  CANCELLED: 'outline',
};

export function EngagementsTable({ engagements }: { engagements: EngagementListRow[] }) {
  const [archiveTarget, setArchiveTarget] = useState<EngagementListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archiveEngagementAction({ engagementId: target.id, reason });
      setBusyId(null);
      if (r.ok) {
        toast.success('Engagement archived');
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns = useMemo<ColumnDef<EngagementListRow>[]>(
    () => [
      {
        header: 'Service',
        accessorKey: 'serviceName',
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.serviceName}</span>,
      },
      {
        header: 'Payer',
        accessorKey: 'payerLabel',
        size: 180,
        cell: ({ row }) => <span className="text-xs">{row.original.payerLabel}</span>,
      },
      {
        header: 'Beneficiary',
        accessorKey: 'beneficiaryName',
        size: 180,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.beneficiaryName ?? '—'}
          </span>
        ),
      },
      {
        header: 'Amount',
        id: 'amount',
        size: 130,
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.agreedAmount} {row.original.currencyCode}
          </span>
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
        size: 50,
        cell: ({ row }) => {
          const e = row.original;
          const isBusy = busyId === e.id;
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
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(e)}>
                  <Archive className="mr-2 size-4" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        data={engagements}
        emptyTitle="No engagements yet"
        emptyDescription="A Service Engagement is the commercial 'order' — created before a payment is recorded."
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title="Archive this engagement?"
        description="Archived engagements are hidden from the list, and the payments recorded against them stop appearing in /payments. The underlying rows stay for accounting history."
        label="Reason (audited)"
        placeholder="e.g. Duplicate entry, cancelled at intake"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
    </>
  );
}
