'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  restoreCandidateAvailabilityAction,
  updatePlacementStatusAction,
} from '@/modules/placements/actions';
import type { PlacementListRow } from '@/modules/placements/service';

const STATUS_VARIANT: Record<PlacementListRow['status'], 'default' | 'secondary' | 'outline'> = {
  PROPOSED: 'secondary',
  CONFIRMED: 'default',
  STARTED: 'default',
  COMPLETED: 'outline',
  TERMINATED_EARLY: 'outline',
};

export function PlacementsTable({ placements }: { placements: PlacementListRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStatus = (p: PlacementListRow, next: PlacementListRow['status']) => {
    setBusy(p.id);
    startTransition(async () => {
      const r = await updatePlacementStatusAction({ placementId: p.id, status: next });
      setBusy(null);
      if (r.ok) toast.success(`Placement moved to ${next.replace(/_/g, ' ')}`);
      else toast.error(r.error.message);
    });
  };

  const restoreAvailability = (p: PlacementListRow) => {
    const reason = window.prompt(`Restore ${p.personName} to AVAILABLE?\n\nReason (audited):`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(p.id);
    startTransition(async () => {
      const r = await restoreCandidateAvailabilityAction({
        personId: p.personId,
        reason: reason.trim(),
      });
      setBusy(null);
      if (r.ok) toast.success(`${p.personName} is now available again`);
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<PlacementListRow>[] = [
    {
      header: 'Candidate → Employer',
      accessorKey: 'personName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.personName}</span>
          <span className="text-xs text-muted-foreground">
            at {row.original.employerName} — {row.original.requisitionTitle}
          </span>
        </div>
      ),
    },
    {
      header: 'Salary',
      id: 'salary',
      size: 130,
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.salary
            ? `${row.original.salary} ${row.original.salaryCurrencyCode ?? ''}`
            : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 150,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Start',
      accessorKey: 'startDate',
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.startDate ?? '—'}</span>
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
        const p = row.original;
        const isBusy = busy === p.id;
        const isTerminal = p.status === 'COMPLETED' || p.status === 'TERMINATED_EARLY';
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Actions" disabled={isBusy} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Placement status</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={p.status !== 'PROPOSED'}
                onSelect={() => setStatus(p, 'CONFIRMED')}
              >
                Confirm (flips availability to PLACED)
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={p.status !== 'CONFIRMED'}
                onSelect={() => setStatus(p, 'STARTED')}
              >
                Mark started
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={p.status !== 'STARTED'}
                onSelect={() => setStatus(p, 'COMPLETED')}
              >
                Mark completed
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={p.status !== 'CONFIRMED' && p.status !== 'STARTED'}
                onSelect={() => setStatus(p, 'TERMINATED_EARLY')}
              >
                Terminate early
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!isTerminal} onSelect={() => restoreAvailability(p)}>
                Restore candidate to AVAILABLE…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={placements}
      emptyTitle="No placements yet"
      emptyDescription="Placements are the successful outcome — created when an application is accepted."
    />
  );
}
