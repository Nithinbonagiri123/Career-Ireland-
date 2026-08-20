'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
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

  const reject = (app: ApplicationListRow) => {
    const reason = window.prompt('Reject application. Reason? (audited)');
    if (!reason || reason.trim().length < 3) return;
    setBusy(app.id);
    startTransition(async () => {
      const r = await updateApplicationStatusAction(
        { applicationId: app.id, status: 'REJECTED', rejectionReason: reason.trim() },
        requisitionId,
      );
      setBusy(null);
      if (r.ok) toast.success('Application rejected');
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<ApplicationListRow>[] = [
    {
      header: 'Candidate',
      accessorKey: 'personName',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.personName}</span>,
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
              onClick={() => reject(app)}
            >
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={applications}
      emptyTitle="No applications yet"
      emptyDescription="Promote a match to Shortlist, then to Application, or create one directly from a candidate profile."
    />
  );
}
