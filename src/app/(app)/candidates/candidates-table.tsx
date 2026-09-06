'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { statusTone } from '@/lib/ui/status-tone';
import type { CandidateListRow } from '@/modules/candidates/repository';
import { CandidatesBulkActionBar } from './bulk-action-bar';

type StaffUserOption = { id: string; fullName: string; email: string };

const AVAILABILITY_LABEL: Record<CandidateListRow['availabilityStatus'], string> = {
  AVAILABLE: 'Available',
  TEMPORARILY_UNAVAILABLE: 'Unavailable',
  PLACED: 'Placed',
};

const columns: ColumnDef<CandidateListRow>[] = [
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
    size: 140,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(row.original.activatedAt, { addSuffix: true })}
      </span>
    ),
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

  const handleSelectionChange = useCallback((rows: CandidateListRow[]) => {
    setSelected(rows);
  }, []);

  const clearSelection = useCallback(() => {
    setResetKey((k) => k + 1);
    setSelected([]);
  }, []);

  return (
    <>
      <DataTable
        columns={columns}
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
      />
      <CandidatesBulkActionBar
        selectedIds={selected.map((r) => r.personId)}
        onClear={clearSelection}
        staffUsers={staffUsers}
      />
    </>
  );
}
