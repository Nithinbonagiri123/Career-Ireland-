'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Archive, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { statusTone } from '@/lib/ui/status-tone';
import type { CandidateListRow } from '@/modules/candidates/repository';
import { archivePersonAction } from '@/modules/persons/actions';
import { CandidatesBulkActionBar } from './bulk-action-bar';

type StaffUserOption = { id: string; fullName: string; email: string };

const AVAILABILITY_LABEL: Record<CandidateListRow['availabilityStatus'], string> = {
  AVAILABLE: 'Available',
  TEMPORARILY_UNAVAILABLE: 'Unavailable',
  PLACED: 'Placed',
};

const COLUMNS: ColumnDef<CandidateListRow>[] = [
  {
    header: 'Candidate',
    accessorKey: 'fullName',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{row.original.fullName}</span>
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
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.currentCity ?? '—'}</span>
    ),
  },
  {
    header: 'Availability',
    accessorKey: 'availabilityStatus',
    size: 130,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <StatusDot tone={statusTone(row.original.availabilityStatus)} />
        {AVAILABILITY_LABEL[row.original.availabilityStatus]}
      </span>
    ),
  },
  {
    header: 'Lifecycle',
    accessorKey: 'lifecycleStatus',
    size: 110,
    cell: ({ row }) => (
      <Badge variant={statusTone(row.original.lifecycleStatus)} className="rounded-full">
        {row.original.lifecycleStatus}
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
        emptyDescription="Candidates appear here after a Lead is converted (payment-verified or staff manual override)."
        emptyAction={
          <Link href="/leads" className={buttonVariants({ size: 'sm' })}>
            <UserPlus className="mr-1.5 size-4" /> Go to Leads
          </Link>
        }
        onRowClick={(row) => router.push(`/candidates/${row.personId}`)}
        enableRowSelection
        onSelectionChange={handleSelectionChange}
        selectionResetKey={resetKey}
        enableGlobalFilter
        globalFilterPlaceholder="Search candidates…"
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
