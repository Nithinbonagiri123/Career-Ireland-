'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Archive, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { DsStatusPill } from '@/components/ds/status-pill';
import { OwnerAvatar } from '@/components/owner-avatar';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Button, buttonVariants } from '@/components/ui/button';
import type { CandidateListRow } from '@/modules/candidates/repository';
import { archivePersonAction } from '@/modules/persons/actions';
import { CandidatesBulkActionBar } from './bulk-action-bar';
import { candidateStatus } from './candidate-filters';

type StaffUserOption = { id: string; fullName: string; email: string };

const COLUMNS: ColumnDef<CandidateListRow>[] = [
  {
    header: 'Candidate',
    accessorKey: 'fullName',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-semibold">{row.original.fullName}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.email ?? row.original.phone ?? '—'}
        </span>
      </div>
    ),
  },
  {
    header: 'Location',
    accessorKey: 'currentCity',
    size: 160,
    cell: ({ row }) => {
      const place = [row.original.currentCity, row.original.currentCountry]
        .filter(Boolean)
        .join(', ');
      return <span className="text-xs text-muted-foreground">{place || '—'}</span>;
    },
  },
  {
    header: 'Status',
    accessorKey: 'availabilityStatus',
    size: 150,
    cell: ({ row }) => {
      // Same status rule as the cards, so both views agree.
      const s = candidateStatus(row.original);
      return (
        <span title={`Lifecycle: ${row.original.lifecycleStatus}`}>
          <DsStatusPill tone={s.tone}>{s.label}</DsStatusPill>
        </span>
      );
    },
  },
  {
    header: 'Owner',
    accessorKey: 'assignedUserName',
    size: 160,
    cell: ({ row }) => (
      <OwnerAvatar
        user={
          row.original.assignedUserId && row.original.assignedUserName
            ? { id: row.original.assignedUserId, fullName: row.original.assignedUserName }
            : null
        }
        size="sm"
        showName
      />
    ),
  },
  {
    header: 'Activated',
    accessorKey: 'activatedAt',
    size: 170,
    cell: ({ row }) => <Timestamp date={row.original.activatedAt} />,
  },
  {
    header: 'Created',
    accessorKey: 'createdAt',
    size: 170,
    cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
  },
];

export function CandidatesTable({
  candidates,
  staffUsers,
}: {
  candidates: CandidateListRow[];
  staffUsers: StaffUserOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CandidateListRow[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<CandidateListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleSelectionChange = useCallback((rows: CandidateListRow[]) => {
    setSelected(rows);
  }, []);

  const clearSelection = useCallback(() => {
    setResetKey((k) => k + 1);
    setSelected([]);
  }, []);

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.personId);
    startTransition(async () => {
      const r = await archivePersonAction({ personId: target.personId, reason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.fullName} archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columnsWithActions = useMemo<ColumnDef<CandidateListRow>[]>(
    () => [
      ...COLUMNS,
      {
        header: '',
        id: 'actions',
        size: 60,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Archive ${row.original.fullName}`}
              disabled={busyId === row.original.personId}
              onClick={(e) => {
                e.stopPropagation();
                setArchiveTarget(row.original);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <Archive className="size-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [busyId],
  );

  return (
    <>
      <DataTable
        columns={columnsWithActions}
        data={candidates}
        emptyIcon={Users}
        emptyTitle="No candidates yet"
        emptyDescription="Candidates land here once a lead is accepted — automatically when payment is verified, or manually from the lead row."
        emptyAction={
          <Link href="/leads" className={buttonVariants({ size: 'sm' })}>
            <UserPlus className="mr-1.5 size-4" /> Go to Leads
          </Link>
        }
        onRowClick={(row) => router.push(`/clients/${row.personId}`)}
        enableRowSelection
        onSelectionChange={handleSelectionChange}
        selectionResetKey={resetKey}
        enableColumnVisibility
      />
      <CandidatesBulkActionBar
        selectedIds={selected.map((r) => r.personId)}
        onClear={clearSelection}
        staffUsers={staffUsers}
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive ${archiveTarget?.fullName ?? ''}?`}
        description="Removes the candidate from every active list globally. Audit history and existing records are preserved. Use Merge instead if this is a duplicate."
        label="Reason (audited)"
        placeholder="e.g. Requested account removal (GDPR)"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.personId}
      />
    </>
  );
}
