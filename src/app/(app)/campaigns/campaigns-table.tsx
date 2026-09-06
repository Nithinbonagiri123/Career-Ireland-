'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArrowRight, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { archiveCampaignAction } from '@/modules/campaigns/actions';
import type { CampaignListRow } from '@/modules/campaigns/service';

const STATUS_VARIANT: Record<CampaignListRow['status'], 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  COMPLETED: 'outline',
  CANCELLED: 'outline',
};

export function CampaignsTable({ campaigns }: { campaigns: CampaignListRow[] }) {
  const [archiveTarget, setArchiveTarget] = useState<CampaignListRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archiveCampaignAction({ campaignId: target.id, reason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.name} archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns = useMemo<ColumnDef<CampaignListRow>[]>(
    () => [
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
        size: 130,
        cell: ({ row }) => {
          const c = row.original;
          const isBusy = busyId === c.id;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Link
                href={`/campaigns/${c.id}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Open <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Actions" disabled={isBusy} />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem render={<Link href={`/campaigns/${c.id}`} />}>
                    Open detail
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(c)}>
                    <Archive className="mr-2 size-4" /> Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [busyId],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={campaigns}
        emptyTitle="No campaigns yet"
        emptyDescription="Run a campaign when the existing talent pool can't fill a requisition. Advertisements live under each campaign."
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive "${archiveTarget?.name ?? ''}"?`}
        description="Archived campaigns are hidden from the list. Ads and prospects remain in the DB but stop appearing under this campaign."
        label="Reason (audited)"
        placeholder="e.g. Filled requisition, campaign ended"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
    </>
  );
}
