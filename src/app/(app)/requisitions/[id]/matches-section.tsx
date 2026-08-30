'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, HelpCircle, MinusCircle, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MatchReasonSnapshot } from '@/lib/db/schema/recruitment';
import { dismissMatchAction, shortlistMatchAction } from '@/modules/matching/actions';
import type { MatchListRow } from '@/modules/matching/service';

const BUCKET_VARIANT: Record<MatchListRow['scoreBucket'], 'default' | 'secondary' | 'outline'> = {
  HIGH: 'default',
  MEDIUM: 'secondary',
  LOW: 'outline',
};

function ReasonBreakdown({ reasons, total }: { reasons: MatchReasonSnapshot[]; total: number }) {
  if (reasons.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This match was created before the scoring engine tracked per-component reasons. Re-run
        matching to populate the breakdown.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border bg-card">
        {reasons.map((r) => (
          <li key={r.label} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {r.matched ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <MinusCircle className="size-3.5 text-muted-foreground" />
                )}
                <span className={r.matched ? 'font-medium' : 'text-muted-foreground'}>
                  {r.label}
                </span>
              </div>
              {r.detail && (
                <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">{r.detail}</p>
              )}
            </div>
            <span
              className={`shrink-0 font-mono text-xs ${
                r.points > 0 ? 'text-emerald-600' : 'text-muted-foreground'
              }`}
            >
              {r.points > 0 ? `+${r.points}` : '·'}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="font-medium">Total</span>
        <span className="font-mono font-semibold">{total} / 100</span>
      </div>
    </div>
  );
}

export function MatchesSection({
  requisitionId,
  matches,
}: {
  requisitionId: string;
  matches: MatchListRow[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonsFor, setReasonsFor] = useState<MatchListRow | null>(null);
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
      size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">{row.original.score}</span>
          <button
            type="button"
            onClick={() => setReasonsFor(row.original)}
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            aria-label={`Why is ${row.original.personName} scored ${row.original.score}?`}
          >
            <HelpCircle className="size-3" /> Why?
          </button>
        </div>
      ),
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
    <>
      <DataTable
        columns={columns}
        data={matches}
        emptyTitle="No matches yet"
        emptyDescription="Click 'Run assisted matching' above to score every active candidate against this requisition."
      />
      <Dialog
        open={reasonsFor !== null}
        onOpenChange={(open) => {
          if (!open) setReasonsFor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Score breakdown</DialogTitle>
          </DialogHeader>
          {reasonsFor && (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-medium">{reasonsFor.personName}</span>{' '}
                <span className="text-muted-foreground">against this requisition</span>
              </p>
              <ReasonBreakdown reasons={reasonsFor.reasons ?? []} total={reasonsFor.score} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
