'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { updateApplicationStatusAction } from '@/modules/applications/actions';
import type { ApplicationListRow } from '@/modules/applications/service';

const STEPS: Array<ApplicationListRow['status']> = [
  'APPLIED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
];

const TERMINAL = new Set(['ACCEPTED', 'REJECTED', 'WITHDRAWN']);

export function ApplicationsSection({
  requisitionId,
  applications,
}: {
  requisitionId: string;
  applications: ApplicationListRow[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApplicationListRow | null>(null);
  const [, startTransition] = useTransition();

  const change = (app: ApplicationListRow, next: ApplicationListRow['status']) => {
    setBusy(app.id);
    startTransition(async () => {
      const r = await updateApplicationStatusAction(
        { applicationId: app.id, status: next },
        requisitionId,
      );
      setBusy(null);
      if (r.ok) toast.success(`${app.personName} moved to ${next.replace(/_/g, ' ')}`);
      else toast.error(r.error.message);
    });
  };

  const confirmReject = (reason: string) => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await updateApplicationStatusAction(
        { applicationId: target.id, status: 'REJECTED', rejectionReason: reason },
        requisitionId,
      );
      setBusy(null);
      if (r.ok) {
        toast.success('Application rejected');
        setRejectTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns: ColumnDef<ApplicationListRow>[] = [
    {
      header: 'Candidate',
      accessorKey: 'personName',
      cell: ({ row }) => (
        <Link
          href={`/applications/${row.original.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {row.original.personName}
          <ExternalLink className="size-3 opacity-60" />
        </Link>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 140,
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full">
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Applied',
      accessorKey: 'appliedAt',
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(row.original.appliedAt, { addSuffix: true })}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 320,
      cell: ({ row }) => {
        const app = row.original;
        if (TERMINAL.has(app.status)) return null;
        const currentIdx = STEPS.indexOf(app.status);
        const nextStep =
          currentIdx >= 0 && currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
        return (
          <div className="flex items-center justify-end gap-1.5">
            {nextStep && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy === app.id}
                onClick={() => change(app, nextStep)}
              >
                → {nextStep.replace(/_/g, ' ')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === app.id}
              onClick={() => setRejectTarget(app)}
            >
              Reject
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
        data={applications}
        emptyTitle="No applications yet"
        emptyDescription="Promote a match to Shortlist, then to Application, or create one directly from a candidate profile."
      />
      <PromptDialog
        open={rejectTarget !== null}
        onCancel={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        title="Reject application"
        description={rejectTarget ? `${rejectTarget.personName} — this is final.` : undefined}
        label="Rejection reason (audited, stored on the application)"
        placeholder="e.g. Overqualified / not enough experience / withdrew"
        confirmLabel="Reject"
        confirmVariant="destructive"
        pending={busy === rejectTarget?.id}
      />
    </>
  );
}
