'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import { OwnerAvatar } from '@/components/owner-avatar';
import { cn } from '@/lib/utils';
import { CASE_STAGE_LABEL, CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import type { CaseListRow } from '@/modules/immigration/service';
import { CASE_STATUS_TONE } from './case-filters';

const columns: ColumnDef<CaseListRow>[] = [
  {
    header: 'Beneficiary',
    accessorKey: 'beneficiaryName',
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        {/* A real link so keyboard users can open the case (the row click
            stays as a mouse shortcut). */}
        <Link
          href={`/immigration/${row.original.id}`}
          onClick={(e) => e.stopPropagation()}
          className={cn('w-fit rounded-sm text-sm font-semibold hover:underline', FOCUS_RING)}
        >
          {row.original.beneficiaryName}
        </Link>
        {row.original.sponsorName && (
          <span className="text-xs text-muted-foreground">Sponsor: {row.original.sponsorName}</span>
        )}
      </div>
    ),
  },
  {
    header: 'Type',
    accessorKey: 'caseType',
    size: 190,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm">{CASE_TYPE_LABEL[row.original.caseType]}</span>
        {row.original.applicationTypeName && (
          <span className="text-xs text-muted-foreground">{row.original.applicationTypeName}</span>
        )}
      </div>
    ),
  },
  {
    header: 'Owner',
    accessorKey: 'ownerName',
    size: 170,
    cell: ({ row }) => (
      <OwnerAvatar
        user={
          row.original.assignedUserId && row.original.ownerName
            ? { id: row.original.assignedUserId, fullName: row.original.ownerName }
            : null
        }
        size="sm"
        showName
      />
    ),
  },
  {
    header: 'Reference',
    accessorKey: 'authorityReference',
    size: 140,
    cell: ({ row }) =>
      row.original.authorityReference ? (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.authorityReference}
        </span>
      ) : null,
  },
  {
    header: 'Stage',
    accessorKey: 'status',
    size: 200,
    cell: ({ row }) => (
      <DsStatusPill tone={CASE_STATUS_TONE[row.original.status]}>
        {CASE_STAGE_LABEL[row.original.status]}
      </DsStatusPill>
    ),
  },
  {
    header: 'Expires',
    accessorKey: 'expiresOn',
    size: 120,
    cell: ({ row }) =>
      row.original.expiresOn ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          {format(new Date(row.original.expiresOn), 'd MMM yyyy')}
        </span>
      ) : null,
  },
];

export function CasesTable({ cases }: { cases: CaseListRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      columns={columns}
      data={cases}
      onRowClick={(row) => router.push(`/immigration/${row.id}`)}
      emptyTitle="No immigration cases match"
      emptyDescription="Clear the filters or pick another stage tab."
    />
  );
}
