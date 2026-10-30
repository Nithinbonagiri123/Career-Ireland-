'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/data-table/data-table';
import { DsStatusPill } from '@/components/ds/status-pill';
import { Timestamp } from '@/components/timestamp';
import { buttonVariants } from '@/components/ui/button';
import type { InterviewRow } from '@/modules/interviews/service';

/** Stage 6G table view for the global Interviews list. */
export function InterviewsTable({ rows }: { rows: InterviewRow[] }) {
  const columns: ColumnDef<InterviewRow>[] = [
    {
      header: 'Candidate',
      accessorKey: 'candidateName',
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={`/candidates/${row.original.candidatePersonId}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {row.original.candidateName}
          </Link>
          {row.original.candidateEmail && (
            <span className="truncate text-xs text-muted-foreground">
              {row.original.candidateEmail}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Job',
      id: 'job',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex min-w-0 flex-col">
            {r.isExternal ? (
              <span className="inline-flex items-center gap-1 truncate text-sm">
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                {r.externalJobTitle ?? r.externalCompanyName ?? 'External application'}
              </span>
            ) : r.requisitionId && r.requisitionTitle ? (
              <Link
                href={`/requisitions/${r.requisitionId}?tab=interviews`}
                className="truncate text-sm hover:underline"
              >
                {r.requisitionTitle}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Requisition</span>
            )}
            {(r.employerName ?? r.externalCompanyName) && (
              <span className="truncate text-xs text-muted-foreground">
                {r.employerName ?? r.externalCompanyName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Type',
      id: 'type',
      size: 120,
      cell: ({ row }) =>
        row.original.isExternal ? (
          <DsStatusPill tone="slate">External</DsStatusPill>
        ) : (
          <DsStatusPill tone="violet">Interview</DsStatusPill>
        ),
    },
    {
      header: 'Moved to Interview',
      accessorKey: 'promotedAt',
      size: 190,
      cell: ({ row }) => <Timestamp date={row.original.promotedAt} />,
    },
    {
      header: '',
      id: 'actions',
      size: 110,
      cell: ({ row }) =>
        row.original.requisitionId ? (
          <div className="flex justify-end">
            <Link
              href={`/requisitions/${row.original.requisitionId}?tab=interviews`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open <ArrowRight className="ml-1.5 size-3.5" aria-hidden />
            </Link>
          </div>
        ) : null,
    },
  ];
  return <DataTable columns={columns} data={rows} />;
}
