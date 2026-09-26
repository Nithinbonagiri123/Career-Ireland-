'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { statusTone } from '@/lib/ui/status-tone';
import { CASE_STAGE_LABEL, CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import type { CaseListRow } from '@/modules/immigration/service';

const columns: ColumnDef<CaseListRow>[] = [
  {
    header: 'Type',
    accessorKey: 'caseType',
    size: 150,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Badge variant="secondary" className="w-fit rounded-full text-[10px]">
          {CASE_TYPE_LABEL[row.original.caseType]}
        </Badge>
        {row.original.applicationTypeName && (
          <span className="mt-1 text-[10px] text-muted-foreground">
            {row.original.applicationTypeName}
          </span>
        )}
      </div>
    ),
  },
  {
    header: 'Beneficiary',
    accessorKey: 'beneficiaryName',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{row.original.beneficiaryName}</span>
        <span className="text-xs text-muted-foreground">
          Sponsor: {row.original.sponsorName ?? '—'}
        </span>
      </div>
    ),
  },
  {
    header: 'Owner',
    accessorKey: 'ownerName',
    size: 160,
    cell: ({ row }) => (
      <span className={row.original.ownerName ? 'text-xs' : 'text-xs text-muted-foreground/60'}>
        {row.original.ownerName ?? 'Unassigned'}
      </span>
    ),
  },
  {
    header: 'Reference',
    accessorKey: 'authorityReference',
    size: 140,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.authorityReference ?? '—'}
      </span>
    ),
  },
  {
    header: 'Stage',
    accessorKey: 'status',
    size: 180,
    cell: ({ row }) => (
      <Badge variant={statusTone(row.original.status)} className="rounded-full">
        {CASE_STAGE_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    header: 'Expires',
    accessorKey: 'expiresOn',
    size: 120,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.expiresOn ?? '—'}</span>
    ),
  },
];

export function CasesTable({ cases }: { cases: CaseListRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      columns={columns}
      data={cases}
      onRowClick={(row) => router.push(`/immigration/${row.id}`)}
      emptyTitle="No immigration cases yet"
      emptyDescription="Employment Permits, Visas, and Visa Extensions all live here. Click 'Open case' above to record the first one."
    />
  );
}
