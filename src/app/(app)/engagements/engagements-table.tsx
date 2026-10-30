'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  Briefcase,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Play,
  User2,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { EntityCard, EntityCardGrid } from '@/components/ds/entity-card';
import { DsEnumPill } from '@/components/ds/status-pill';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currency';
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
    (e: EngagementListRow, status: 'ACTIVE' | 'COMPLETED' | 'PENDING_PAYMENT', verb: string) => {
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

  /** Status / archive actions — one menu for the table and the phone cards. */
  const actionsMenu = (e: EngagementListRow) => {
    const isBusy = busyId === e.id;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Actions" disabled={isBusy} />}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {e.status === 'REQUESTED' && (
            <DropdownMenuItem
              onClick={() => transition(e, 'PENDING_PAYMENT', 'moved to awaiting payment')}
            >
              <Clock className="mr-2 size-4" /> Mark awaiting payment
            </DropdownMenuItem>
          )}
          {(e.status === 'REQUESTED' || e.status === 'PENDING_PAYMENT') && (
            <DropdownMenuItem onClick={() => transition(e, 'ACTIVE', 'started')}>
              <Play className="mr-2 size-4" /> Start service
            </DropdownMenuItem>
          )}
          {e.status === 'ACTIVE' && (
            <DropdownMenuItem onClick={() => transition(e, 'COMPLETED', 'completed')}>
              <CheckCircle2 className="mr-2 size-4" /> Complete service
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setArchiveTarget(e)}>
            <Archive className="mr-2 size-4" /> Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // actionsMenu is re-created each render from busyId / transition, which
  // are the real dependencies listed below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
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
        cell: ({ row }) =>
          row.original.payerPersonId ? (
            <Link
              href={`/candidates/${row.original.payerPersonId}`}
              className="text-xs underline-offset-2 hover:underline"
            >
              {row.original.payerLabel}
            </Link>
          ) : row.original.payerEmployerId ? (
            <Link
              href={`/employers/${row.original.payerEmployerId}`}
              className="text-xs underline-offset-2 hover:underline"
            >
              {row.original.payerLabel}
            </Link>
          ) : (
            <span className="text-xs">{row.original.payerLabel}</span>
          ),
      },
      {
        header: 'Beneficiary',
        accessorKey: 'beneficiaryName',
        size: 180,
        cell: ({ row }) =>
          row.original.beneficiaryPersonId ? (
            <Link
              href={`/candidates/${row.original.beneficiaryPersonId}`}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground"
            >
              {row.original.beneficiaryName ?? 'Not recorded'}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.original.beneficiaryName ?? 'Not recorded'}
            </span>
          ),
      },
      {
        header: 'Amount',
        id: 'amount',
        size: 130,
        cell: ({ row }) => (
          <span className="text-sm font-medium tabular-nums">
            {formatCurrency(row.original.agreedAmount, row.original.currencyCode)}
          </span>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 140,
        cell: ({ row }) => (
          <DsEnumPill
            status={row.original.status}
            label={row.original.status === 'PENDING_PAYMENT' ? 'Awaiting payment' : undefined}
          />
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
          return actionsMenu(row.original);
        },
      },
    ],
    [busyId, transition],
  );

  return (
    <>
      {/* Tablet and desktop: the table. Phones: cards with the same rows
          and the same actions menu, so nothing scrolls sideways. */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={engagements}
          emptyTitle="No services yet"
          emptyDescription="A service is the commercial order with a customer — start one before you record a payment against it."
        />
      </div>
      <div className="md:hidden">
        <EntityCardGrid>
          {engagements.map((e) => (
            <EntityCard
              key={e.id}
              testId="engagement-list-card"
              ariaLabel={`Service ${e.serviceName} for ${e.payerLabel}`}
              avatar={{ icon: Briefcase, tone: 'blue' }}
              status={
                <DsEnumPill
                  status={e.status}
                  label={e.status === 'PENDING_PAYMENT' ? 'Awaiting payment' : undefined}
                />
              }
              timestamp={<Timestamp date={e.createdAt} absoluteOnly />}
              menu={actionsMenu(e)}
              title={e.serviceName}
              subtitle={formatCurrency(e.agreedAmount, e.currencyCode)}
              meta={[
                {
                  key: 'payer',
                  icon: Wallet,
                  content: e.payerPersonId ? (
                    <Link href={`/candidates/${e.payerPersonId}`} className="hover:underline">
                      Payer: {e.payerLabel}
                    </Link>
                  ) : e.payerEmployerId ? (
                    <Link href={`/employers/${e.payerEmployerId}`} className="hover:underline">
                      Payer: {e.payerLabel}
                    </Link>
                  ) : (
                    `Payer: ${e.payerLabel}`
                  ),
                },
                {
                  key: 'beneficiary',
                  icon: User2,
                  content: e.beneficiaryName ? `For: ${e.beneficiaryName}` : null,
                },
              ]}
            />
          ))}
        </EntityCardGrid>
      </div>
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
