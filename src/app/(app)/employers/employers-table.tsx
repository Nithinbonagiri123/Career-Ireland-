'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Pencil } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { Employer } from '@/lib/db/schema/recruitment';
import { EmployerDialog } from './employer-dialog';

const STATUS_VARIANT: Record<Employer['relationshipStatus'], 'default' | 'secondary' | 'outline'> =
  {
    PROSPECT: 'secondary',
    ACTIVE: 'default',
    ON_HOLD: 'outline',
    ARCHIVED: 'outline',
  };

export function EmployersTable({ employers }: { employers: Employer[] }) {
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
      size: 200,
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
    <DataTable
      columns={columns}
      data={employers}
      emptyTitle="No employers yet"
      emptyDescription="Add the companies Career Ireland recruits for."
    />
  );
}
