'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { StatusChip } from '@/components/status-chip';
import { Timestamp } from '@/components/timestamp';
import { buttonVariants } from '@/components/ui/button';
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_TONE } from '@/modules/campaigns/labels';
import type { CampaignListRow } from '@/modules/campaigns/service';

/**
 * R4 — campaigns list. Lifecycle actions live in the campaign workspace,
 * where the current state and its consequences are visible.
 */
export function CampaignsTable({
  campaigns,
  archivedView,
}: {
  campaigns: CampaignListRow[];
  archivedView: boolean;
}) {
  const columns = useMemo<ColumnDef<CampaignListRow>[]>(
    () => [
      {
        header: 'Campaign',
        accessorKey: 'name',
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/campaigns/${c.id}`}
                className="truncate text-sm font-medium hover:underline"
              >
                {c.name}
              </Link>
              <span className="truncate text-xs text-muted-foreground">
                {c.requisitionTitle
                  ? `${c.requisitionTitle}${c.employerName ? ` · ${c.employerName}` : ''}`
                  : 'Talent pool'}
              </span>
            </div>
          );
        },
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 120,
        cell: ({ row }) => (
          <StatusChip
            label={CAMPAIGN_STATUS_LABEL[row.original.status]}
            tone={CAMPAIGN_TONE[row.original.status]}
          />
        ),
      },
      {
        header: 'Ads',
        id: 'ads',
        size: 90,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.activeAdCount} / {row.original.adCount} running
          </span>
        ),
      },
      {
        header: 'Prospects',
        id: 'prospects',
        size: 120,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.prospectCount}
            <span className="text-muted-foreground">
              {' '}
              · {row.original.convertedCount} converted
            </span>
          </span>
        ),
      },
      {
        header: 'Started',
        accessorKey: 'startedAt',
        size: 160,
        cell: ({ row }) =>
          row.original.startedAt ? (
            <Timestamp date={row.original.startedAt} absoluteOnly className="text-xs" />
          ) : (
            <span className="text-xs text-muted-foreground">Not started</span>
          ),
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        size: 180,
        cell: ({ row }) => (
          <div className="flex flex-col text-xs">
            <Timestamp date={row.original.createdAt} absoluteOnly className="text-xs" />
            {row.original.createdByName && (
              <span className="text-muted-foreground">by {row.original.createdByName}</span>
            )}
          </div>
        ),
      },
      {
        header: '',
        id: 'open',
        size: 90,
        cell: ({ row }) => (
          <Link
            href={`/campaigns/${row.original.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={campaigns}
      emptyTitle={archivedView ? 'No archived campaigns' : 'No campaigns here'}
      emptyDescription={
        archivedView
          ? 'Archived campaigns appear here and can be restored from the campaign page.'
          : 'Start a campaign when the existing talent pool cannot fill a job, or to grow the pool.'
      }
    />
  );
}
