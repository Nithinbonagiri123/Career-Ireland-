'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Archive, CheckCircle2, MoreHorizontal, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusTone } from '@/lib/ui/status-tone';
import { archiveEngagementAction, updateEngagementStatusAction } from '@/modules/commerce/actions';
import type { EngagementListRow } from '@/modules/commerce/repository';

export function EngagementsTable({ engagements }: { engagements: EngagementListRow[] }) {
  const router = useRouter();
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
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  // Session 11: direct verb for starting/completing the service.
  // Transitions the engagement status one hop and audits via the shared
  // updateEngagementStatus action. router.refresh() re-pulls the server
  // RSC payload so the row's status badge reflects the new state —
  // without it the DB updates but the UI looks like nothing happened.
  const transition = useCallback(
    (e: EngagementListRow, status: 'ACTIVE' | 'COMPLETED', verb: string) => {
      if (status === 'COMPLETED' && !window.confirm('Mark this service as complete?')) return;
      setBusyId(e.id);
      startTransition(async () => {
        const r = await updateEngagementStatusAction({ engagementId: e.id, status });
        setBusyId(null);
        if (r.ok) {
          toast.success(`Service ${verb}`);
          router.refresh();
        } else toast.error(r.error.message);
      });
    },
    [router],
  );

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
          <Badge variant={statusTone(row.original.status)} className="rounded-full">
            {row.original.status.replace(/_/g, ' ')}
          </Badge>
        ),
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        size: 170,
        cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
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
                {(e.status === 'REQUESTED' || e.status === 'PENDING_PAYMENT') && (
                  <DropdownMenuItem onSelect={() => transition(e, 'ACTIVE', 'started')}>
                    <Play className="mr-2 size-4" /> Start service
                  </DropdownMenuItem>
                )}
                {e.status === 'ACTIVE' && (
                  <DropdownMenuItem onSelect={() => transition(e, 'COMPLETED', 'completed')}>
                    <CheckCircle2 className="mr-2 size-4" /> Complete service
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(e)}>
                  <Archive className="mr-2 size-4" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [busyId, transition],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={engagements}
        emptyTitle="No services yet"
        emptyDescription="A service is the commercial order with a customer — start one before you record a payment against it."
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title="Archive this service?"
        description="Archived services are hidden from the list, and payments recorded against them stop appearing on the Payments page. The underlying rows stay for accounting history."
        label="Reason (audited)"
        placeholder="e.g. Duplicate entry, cancelled at intake"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
    </>
  );
}
