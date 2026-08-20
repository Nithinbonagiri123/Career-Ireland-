'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import type { CandidateListRow } from '@/modules/candidates/repository';

const AVAILABILITY_LABEL: Record<CandidateListRow['availabilityStatus'], string> = {
  AVAILABLE: 'Available',
  TEMPORARILY_UNAVAILABLE: 'Unavailable',
  PLACED: 'Placed',
};

const AVAILABILITY_DOT: Record<CandidateListRow['availabilityStatus'], string> = {
  AVAILABLE: 'bg-emerald-500',
  TEMPORARILY_UNAVAILABLE: 'bg-amber-500',
  PLACED: 'bg-sky-500',
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
        <span
          className={`size-1.5 rounded-full ${AVAILABILITY_DOT[row.original.availabilityStatus]}`}
        />
        {AVAILABILITY_LABEL[row.original.availabilityStatus]}
      </span>
    ),
  },
  {
    header: 'Lifecycle',
    accessorKey: 'lifecycleStatus',
    size: 110,
    cell: ({ row }) => (
      <Badge
        variant={row.original.lifecycleStatus === 'ACTIVE' ? 'default' : 'outline'}
        className="rounded-full"
      >
        {row.original.lifecycleStatus}
      </Badge>
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

export function CandidatesTable({ candidates }: { candidates: CandidateListRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      columns={columns}
      data={candidates}
      emptyTitle="No candidates yet"
      emptyDescription="Candidates appear here after a Lead is converted (payment-verified or staff manual override)."
      onRowClick={(row) => router.push(`/candidates/${row.personId}`)}
    />
  );
}
