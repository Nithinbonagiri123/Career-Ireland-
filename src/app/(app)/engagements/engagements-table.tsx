'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import type { EngagementListRow } from '@/modules/commerce/repository';

const STATUS_VARIANT: Record<EngagementListRow['status'], 'default' | 'secondary' | 'outline'> = {
  REQUESTED: 'secondary',
  PENDING_PAYMENT: 'secondary',
  ACTIVE: 'default',
  ON_HOLD: 'outline',
  COMPLETED: 'outline',
  CANCELLED: 'outline',
};

const columns: ColumnDef<EngagementListRow>[] = [
  {
    header: 'Service',
    accessorKey: 'serviceName',
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.serviceName}</span>,
  },
  {
    header: 'Payer',
    accessorKey: 'payerLabel',
    size: 180,
    cell: ({ row }) => <span className="text-xs">{row.original.payerLabel}</span>,
  },
  {
    header: 'Beneficiary',
    accessorKey: 'beneficiaryName',
    size: 180,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.beneficiaryName ?? '—'}</span>
    ),
  },
  {
    header: 'Amount',
    id: 'amount',
    size: 130,
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.agreedAmount} {row.original.currencyCode}
      </span>
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
];

export function EngagementsTable({ engagements }: { engagements: EngagementListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={engagements}
      emptyTitle="No engagements yet"
      emptyDescription="A Service Engagement is the commercial 'order' — created before a payment is recorded."
    />
  );
}
