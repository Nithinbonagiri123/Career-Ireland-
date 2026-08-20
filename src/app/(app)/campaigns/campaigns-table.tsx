'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { CampaignListRow } from '@/modules/campaigns/service';

const STATUS_VARIANT: Record<CampaignListRow['status'], 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  COMPLETED: 'outline',
  CANCELLED: 'outline',
};

const columns: ColumnDef<CampaignListRow>[] = [
  {
    header: 'Campaign',
    accessorKey: 'name',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{row.original.name}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.requisitionTitle ?? 'Standalone'}
        </span>
      </div>
    ),
  },
  {
    header: 'Status',
    accessorKey: 'status',
    size: 130,
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
        {row.original.status}
      </Badge>
    ),
  },
  {
    header: 'Started',
    accessorKey: 'startedAt',
    size: 140,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.startedAt
          ? formatDistanceToNow(row.original.startedAt, { addSuffix: true })
          : '—'}
      </span>
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
          href={`/campaigns/${row.original.id}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Open <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      </div>
    ),
  },
];

export function CampaignsTable({ campaigns }: { campaigns: CampaignListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={campaigns}
      emptyTitle="No campaigns yet"
      emptyDescription="Run a campaign when the existing talent pool can't fill a requisition. Advertisements live under each campaign."
    />
  );
}
