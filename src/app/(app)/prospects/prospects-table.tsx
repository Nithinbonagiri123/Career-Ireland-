'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { StatusChip } from '@/components/status-chip';
import { Timestamp } from '@/components/timestamp';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatZoned } from '@/lib/zoned-time';
import { PROSPECT_STATUS_LABEL, PROSPECT_TONE } from '@/modules/campaigns/labels';
import type { ProspectRow } from '@/modules/campaigns/service';

/** R4 — cross-campaign prospect list. Actions live on the prospect page. */
export function ProspectsTable({
  prospects,
  nowIso,
}: {
  prospects: ProspectRow[];
  nowIso: string;
}) {
  const now = new Date(nowIso).getTime();
  const columns = useMemo<ColumnDef<ProspectRow>[]>(
    () => [
      {
        header: 'Prospect',
        accessorKey: 'personName',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/prospects/${row.original.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {row.original.personName}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.personEmail ?? 'No email'}
            </span>
          </div>
        ),
      },
      {
        header: 'Campaign',
        accessorKey: 'campaignName',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/campaigns/${row.original.campaignId}`}
              className="truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {row.original.campaignName}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.advertisementCountry}
              {row.original.advertisementPlatform ? ` · ${row.original.advertisementPlatform}` : ''}
            </span>
          </div>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 130,
        cell: ({ row }) => (
          <StatusChip
            label={PROSPECT_STATUS_LABEL[row.original.status]}
            tone={PROSPECT_TONE[row.original.status]}
          />
        ),
      },
      {
        header: 'Follow-up',
        id: 'followUp',
        size: 190,
        cell: ({ row }) => {
          const due = row.original.followUpDueAt;
          if (!due) return <span className="text-xs text-muted-foreground">—</span>;
          const overdue = new Date(due).getTime() <= now;
          return (
            <span
              className={cn(
                'text-xs',
                overdue ? 'font-medium text-status-warning' : 'text-muted-foreground',
              )}
            >
              {overdue ? 'Due ' : ''}
              {formatZoned(new Date(due))}
              {row.original.followUpAssigneeName ? ` · ${row.original.followUpAssigneeName}` : ''}
            </span>
          );
        },
      },
      {
        header: 'Recorded',
        accessorKey: 'createdAt',
        size: 170,
        cell: ({ row }) => (
          <Timestamp date={row.original.createdAt} absoluteOnly className="text-xs" />
        ),
      },
      {
        header: '',
        id: 'open',
        size: 90,
        cell: ({ row }) => (
          <Link
            href={`/prospects/${row.original.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        ),
      },
    ],
    [now],
  );

  return (
    <DataTable
      columns={columns}
      data={prospects}
      emptyTitle="No prospects match these filters"
      emptyDescription="Prospects are recorded from a campaign’s Prospects tab. Clear the filters if you expected results."
    />
  );
}
