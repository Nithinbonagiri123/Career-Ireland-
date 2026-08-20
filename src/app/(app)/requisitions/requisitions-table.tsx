'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { RequisitionListRow } from '@/modules/requisitions/service';

const STATUS_VARIANT: Record<RequisitionListRow['status'], 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  OPEN: 'default',
  IN_PROGRESS: 'default',
  PARTIALLY_FILLED: 'secondary',
  FILLED: 'outline',
  CLOSED: 'outline',
  CANCELLED: 'outline',
};

const columns: ColumnDef<RequisitionListRow>[] = [
  {
    header: 'Title',
    accessorKey: 'title',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{row.original.title}</span>
        <span className="text-xs text-muted-foreground">{row.original.employerName}</span>
      </div>
    ),
  },
  {
    header: 'Positions',
    id: 'positions',
    size: 110,
    cell: ({ row }) => (
      <span className="text-xs">
        {row.original.positionsFilled} / {row.original.positionsRequired}
      </span>
    ),
  },
  {
    header: 'Type',
    accessorKey: 'employmentType',
    size: 120,
    cell: ({ row }) => (
      <Badge variant="secondary" className="rounded-full text-[10px]">
        {row.original.employmentType.replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    header: 'Status',
    accessorKey: 'status',
    size: 140,
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
        {row.original.status.replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    header: 'Created',
    accessorKey: 'createdAt',
    size: 130,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatDistanceToNow(row.original.createdAt, { addSuffix: true })}
      </span>
    ),
  },
  {
    header: '',
    id: 'actions',
    size: 100,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Link
          href={`/requisitions/${row.original.id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Open <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      </div>
    ),
  },
];

export function RequisitionsTable({ requisitions }: { requisitions: RequisitionListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={requisitions}
      emptyTitle="No requisitions yet"
      emptyDescription="Every recruitment engagement starts with a Job Requisition from an Employer."
    />
  );
}
