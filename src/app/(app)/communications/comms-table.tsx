'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import type { CommunicationRow } from '@/modules/activities/service';

const columns: ColumnDef<CommunicationRow>[] = [
  {
    header: 'When',
    accessorKey: 'occurredAt',
    size: 140,
    cell: ({ row }) => (
      <span
        className="text-xs text-muted-foreground"
        title={row.original.occurredAt.toLocaleString()}
      >
        {formatDistanceToNow(row.original.occurredAt, { addSuffix: true })}
      </span>
    ),
  },
  {
    header: 'Type',
    accessorKey: 'type',
    size: 130,
    cell: ({ row }) => (
      <Badge variant="secondary" className="rounded-full text-[10px]">
        {row.original.type.replace(/_/g, ' ')} · {row.original.direction}
      </Badge>
    ),
  },
  {
    header: 'Subject',
    accessorKey: 'subject',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium">{row.original.subject ?? '(no subject)'}</span>
        {row.original.body && (
          <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.body}</span>
        )}
      </div>
    ),
  },
  {
    header: 'Staff',
    accessorKey: 'staffName',
    size: 150,
    cell: ({ row }) => <span className="text-xs">{row.original.staffName}</span>,
  },
  {
    header: 'Follow-up',
    accessorKey: 'followUpRequired',
    size: 120,
    cell: ({ row }) =>
      row.original.followUpRequired ? (
        <Badge variant="default" className="rounded-full text-[10px]">
          Required
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
];

export function CommsTable({ comms }: { comms: CommunicationRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={comms}
      emptyTitle="No communications logged"
      emptyDescription="Every email, call, meeting, and note lives here — attached to the person, employer, requisition, engagement, or case it relates to."
    />
  );
}
