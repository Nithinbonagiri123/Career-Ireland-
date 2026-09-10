'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArrowRight, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { Employer } from '@/lib/db/schema/recruitment';
import { archiveEmployerAction } from '@/modules/employers/actions';
import { EmployerDialog } from './employer-dialog';

const STATUS_VARIANT: Record<Employer['relationshipStatus'], 'default' | 'secondary' | 'outline'> =
  {
    PROSPECT: 'secondary',
    ACTIVE: 'default',
    ON_HOLD: 'outline',
    ARCHIVED: 'outline',
  };

export function EmployersTable({ employers }: { employers: Employer[] }) {
  const [archiveTarget, setArchiveTarget] = useState<Employer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusyId(target.id);
    startTransition(async () => {
      const r = await archiveEmployerAction({ employerId: target.id, reason });
      setBusyId(null);
      if (r.ok) {
        toast.success(`${target.legalName} archived`);
        setArchiveTarget(null);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const columns: ColumnDef<Employer>[] = [
    {
      header: 'Employer',
      accessorKey: 'legalName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.legalName}</span>
          {row.original.tradingName && (
            <span className="text-xs text-muted-foreground">t/a {row.original.tradingName}</span>
          )}
        </div>
      ),
    },
    {
      header: 'Industry',
      accessorKey: 'industry',
      size: 160,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.industry ?? '—'}</span>
      ),
    },
    {
      header: 'Location',
      id: 'location',
      size: 160,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {[row.original.city, row.original.country].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'relationshipStatus',
      size: 120,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.relationshipStatus]} className="rounded-full">
          {row.original.relationshipStatus.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Added',
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
      size: 240,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <EmployerDialog
            initial={row.original}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.legalName}`}>
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Archive ${row.original.legalName}`}
            disabled={busyId === row.original.id}
            onClick={() => setArchiveTarget(row.original)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Archive className="size-3.5" />
          </Button>
          <Link
            href={`/employers/${row.original.id}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={employers}
        emptyTitle="No employers yet"
        emptyDescription="Add the companies Ireland Career Gateway recruits for."
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive ${archiveTarget?.legalName ?? ''}?`}
        description="Removes the employer from the active list. Requisitions, placements, and history stay intact and can be restored."
        label="Reason (audited)"
        placeholder="e.g. Client relationship ended 2026-09-01"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busyId === archiveTarget?.id}
      />
    </>
  );
}
