'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import type { CaseListRow } from '@/modules/immigration/service';

const TYPE_LABEL: Record<CaseListRow['caseType'], string> = {
  EMPLOYMENT_PERMIT: 'Permit',
  VISA: 'Visa',
  VISA_EXTENSION: 'Extension',
};

const STATUS_VARIANT: Record<CaseListRow['status'], 'default' | 'secondary' | 'outline'> = {
  OPEN: 'secondary',
  DOCUMENTS_PENDING: 'secondary',
  SUBMITTED: 'default',
  UNDER_AUTHORITY_REVIEW: 'default',
  APPROVED: 'outline',
  REJECTED: 'outline',
  CLOSED: 'outline',
};

const columns: ColumnDef<CaseListRow>[] = [
  {
    header: 'Type',
    accessorKey: 'caseType',
    size: 130,
    cell: ({ row }) => (
      <Badge variant="secondary" className="rounded-full">
        {TYPE_LABEL[row.original.caseType]}
      </Badge>
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
    header: 'Reference',
    accessorKey: 'authorityReference',
    size: 160,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.authorityReference ?? '—'}
      </span>
    ),
  },
  {
    header: 'Status',
    accessorKey: 'status',
    size: 190,
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
        {row.original.status.replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    header: 'Expires',
    accessorKey: 'expiresOn',
    size: 130,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.expiresOn ?? '—'}</span>
    ),
  },
];

export function CasesTable({ cases }: { cases: CaseListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={cases}
      emptyTitle="No immigration cases yet"
      emptyDescription="Employment Permits, Visas, and Visa Extensions all live here."
    />
  );
}
