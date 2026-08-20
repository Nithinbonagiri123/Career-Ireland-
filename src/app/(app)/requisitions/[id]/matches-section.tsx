'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dismissMatchAction, shortlistMatchAction } from '@/modules/matching/actions';
import type { MatchListRow } from '@/modules/matching/service';

const BUCKET_VARIANT: Record<MatchListRow['scoreBucket'], 'default' | 'secondary' | 'outline'> = {
  HIGH: 'default',
  MEDIUM: 'secondary',
  LOW: 'outline',
};

export function MatchesSection({
  requisitionId,
  matches,
}: {
  requisitionId: string;
  matches: MatchListRow[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const shortlist = (id: string) => {
    setBusy(id);
    startTransition(async () => {
      const r = await shortlistMatchAction(id, requisitionId);
      setBusy(null);
      if (r.ok) toast.success('Shortlisted');
      else toast.error(r.error.message);
    });
  };

  const dismiss = (id: string) => {
    setBusy(id);
    startTransition(async () => {
      const r = await dismissMatchAction(id, requisitionId);
      setBusy(null);
      if (r.ok) toast.success('Match dismissed');
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<MatchListRow>[] = [
    {
      header: 'Candidate',
      accessorKey: 'personName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.personName}</span>
          <span className="text-xs text-muted-foreground">{row.original.personEmail ?? '—'}</span>
        </div>
      ),
    },
    {
      header: 'Score',
      accessorKey: 'score',
      size: 80,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.score}</span>,
    },
    {
      header: 'Bucket',
      accessorKey: 'scoreBucket',
      size: 100,
      cell: ({ row }) => (
        <Badge
          variant={BUCKET_VARIANT[row.original.scoreBucket]}
          className="rounded-full text-[10px]"
        >
          {row.original.scoreBucket}
        </Badge>
      ),
    },
    {
      header: 'Availability',
      accessorKey: 'availabilityStatus',
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs">{row.original.availabilityStatus.replace(/_/g, ' ')}</span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 120,
      cell: ({ row }) => (
        <Badge variant="outline" className="rounded-full text-[10px]">
          {row.original.status}
        </Badge>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 180,
      cell: ({ row }) => {
        const m = row.original;
        const done = m.status === 'SHORTLISTED' || m.status === 'DISMISSED';
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={done || busy === m.id}
              onClick={() => shortlist(m.id)}
            >
              <Check className="mr-1 size-3.5" /> Shortlist
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={done || busy === m.id}
              onClick={() => dismiss(m.id)}
            >
              <X className="mr-1 size-3.5" /> Dismiss
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={matches}
      emptyTitle="No matches yet"
      emptyDescription="Click 'Run assisted matching' above to score every active candidate against this requisition."
    />
  );
}
