'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, UserCheck } from 'lucide-react';
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
import { convertLeadAction, updateLeadStatusAction } from '@/modules/leads/actions';
import type { LeadListRow } from '@/modules/leads/repository';

const STATUS_VARIANT: Record<LeadListRow['status'], 'default' | 'secondary' | 'outline'> = {
  NEW: 'default',
  CONTACTED: 'secondary',
  AWAITING_PAYMENT: 'secondary',
  CONVERTED: 'outline',
  LOST: 'outline',
  REJECTED: 'outline',
};

type Props = { leads: LeadListRow[] };

export function LeadsTable({ leads }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStatus = (
    lead: LeadListRow,
    status: 'CONTACTED' | 'AWAITING_PAYMENT' | 'LOST' | 'REJECTED',
  ) => {
    setBusyId(lead.id);
    startTransition(async () => {
      const result = await updateLeadStatusAction({ leadId: lead.id, status });
      setBusyId(null);
      if (result.ok) toast.success(`Lead marked ${status.toLowerCase().replace(/_/g, ' ')}`);
      else toast.error(result.error.message);
    });
  };

  const convert = (lead: LeadListRow) => {
    const reason = window.prompt(
      `Manually activating ${lead.personName} as a candidate.\n\nWhy are you overriding the normal payment-verified flow? (audited)`,
    );
    if (!reason || reason.trim().length < 3) return;
    setBusyId(lead.id);
    startTransition(async () => {
      const result = await convertLeadAction({
        leadId: lead.id,
        method: 'MANUAL_OVERRIDE',
        reason: reason.trim(),
      });
      setBusyId(null);
      if (result.ok) toast.success(`${lead.personName} is now an active candidate`);
      else toast.error(result.error.message);
    });
  };

  const columns: ColumnDef<LeadListRow>[] = [
    {
      header: 'Person',
      accessorKey: 'personName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.personName}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.personEmail ?? row.original.personPhone ?? '—'}
          </span>
        </div>
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
      header: 'Assigned',
      accessorKey: 'assignedUserName',
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.assignedUserName ?? 'Unassigned'}
        </span>
      ),
    },
    {
      header: 'Created',
      accessorKey: 'createdAt',
      size: 140,
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
        const lead = row.original;
        const isBusy = busyId === lead.id;
        const canTransition = lead.status !== 'CONVERTED';
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Actions" disabled={isBusy} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Change status</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!canTransition}
                onSelect={() => setStatus(lead, 'CONTACTED')}
              >
                Mark contacted
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canTransition}
                onSelect={() => setStatus(lead, 'AWAITING_PAYMENT')}
              >
                Awaiting payment
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canTransition} onSelect={() => convert(lead)}>
                <UserCheck className="mr-2 size-4" /> Convert to candidate…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canTransition} onSelect={() => setStatus(lead, 'LOST')}>
                Mark lost
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canTransition}
                onSelect={() => setStatus(lead, 'REJECTED')}
              >
                Mark rejected
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
      data={leads}
      emptyTitle="No leads yet"
      emptyDescription="Every candidate starts as a Lead. Create the first one with the button above."
    />
  );
}
