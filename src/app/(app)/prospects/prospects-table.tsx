'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, CheckCircle2, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusTone } from '@/lib/ui/status-tone';
import {
  convertProspectToCandidateAction,
  updateProspectStatusAction,
} from '@/modules/campaigns/actions';
import type { ProspectRow } from '@/modules/campaigns/service';

type Status = ProspectRow['status'];

const STATUS_LABEL: Record<Status, string> = {
  NEW: 'New',
  SCREENED: 'Screened',
  CONVERTED_TO_CANDIDATE: 'Converted',
  RETAINED_IN_POOL: 'Talent pool',
  NOT_SUITABLE: 'Not suitable',
};

const STATUS_TONE_INPUT: Record<Status, string> = {
  NEW: 'INFO',
  SCREENED: 'ACTIVE',
  CONVERTED_TO_CANDIDATE: 'SUCCESS',
  RETAINED_IN_POOL: 'PENDING',
  NOT_SUITABLE: 'CANCELLED',
};

// Reuse the canonical enum → tone map by feeding it existing enum keys.
// (`ACTIVE` → success, `PENDING` → warning, `CANCELLED` → neutral, `INFO`
// falls through to neutral. Explicit mapping is cheaper than adding new
// enum values to the shared map.)
const CHANGEABLE_STATUSES: Status[] = ['NEW', 'SCREENED', 'RETAINED_IN_POOL', 'NOT_SUITABLE'];

export function ProspectsTable({ prospects }: { prospects: ProspectRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStatus = useCallback((p: ProspectRow, next: Status) => {
    setBusyId(p.id);
    startTransition(async () => {
      const r = await updateProspectStatusAction({ prospectId: p.id, status: next });
      setBusyId(null);
      if (r.ok) toast.success(`${p.personName} marked ${STATUS_LABEL[next].toLowerCase()}`);
      else toast.error(r.error.message);
    });
  }, []);

  const convert = useCallback((p: ProspectRow) => {
    setBusyId(p.id);
    startTransition(async () => {
      const r = await convertProspectToCandidateAction({ prospectId: p.id });
      setBusyId(null);
      if (r.ok) {
        toast.success(
          r.data.created
            ? `${p.personName} converted to candidate`
            : `${p.personName} linked to existing candidate profile`,
        );
      } else {
        toast.error(r.error.message);
      }
    });
  }, []);

  const columns = useMemo<ColumnDef<ProspectRow>[]>(
    () => [
      {
        header: 'Prospect',
        accessorKey: 'personName',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium">{row.original.personName}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.personEmail ?? 'No email'}
            </span>
          </div>
        ),
      },
      {
        header: 'Campaign',
        accessorKey: 'campaignName',
        cell: ({ row }) => (
          <Link
            href={`/campaigns/${row.original.campaignId}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {row.original.campaignName}
          </Link>
        ),
      },
      {
        header: 'Ad',
        accessorKey: 'advertisementCountry',
        size: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.advertisementCountry}
            {row.original.advertisementPlatform ? ` · ${row.original.advertisementPlatform}` : ''}
          </span>
        ),
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 140,
        cell: ({ row }) => (
          <Badge
            variant={statusTone(STATUS_TONE_INPUT[row.original.status])}
            className="rounded-full"
          >
            {STATUS_LABEL[row.original.status]}
          </Badge>
        ),
      },
      {
        header: 'Recorded',
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
        size: 160,
        cell: ({ row }) => {
          const p = row.original;
          const isBusy = busyId === p.id;
          const alreadyConverted = p.status === 'CONVERTED_TO_CANDIDATE';
          return (
            <div className="flex items-center justify-end gap-1.5">
              {alreadyConverted && p.hasCandidateProfile ? (
                <Link
                  href={`/candidates/${p.personId}`}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Candidate <ArrowRight className="size-3" />
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => convert(p)}
                  disabled={isBusy}
                  className="h-8"
                >
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  Convert
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Actions" disabled={isBusy} />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem render={<Link href={`/campaigns/${p.campaignId}`} />}>
                    Open campaign
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {CHANGEABLE_STATUSES.filter((s) => s !== p.status).map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => setStatus(p, s)}>
                      Mark {STATUS_LABEL[s].toLowerCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [busyId, convert, setStatus],
  );

  return (
    <DataTable
      columns={columns}
      data={prospects}
      emptyTitle="No prospects match these filters"
      emptyDescription="Prospects are recorded from an advertisement's intake dialog on the campaign detail page. Try clearing filters if you're expecting results."
    />
  );
}
