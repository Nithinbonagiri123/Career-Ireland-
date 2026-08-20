'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DocumentType } from '@/lib/db/schema/reference';
import { setDocumentTypeActiveAction } from '@/modules/document-types/actions';
import { DocTypeDialog } from './doc-type-dialog';

const APPLIES_LABEL: Record<DocumentType['appliesTo'], string> = {
  PERSON: 'Person',
  EMPLOYER: 'Employer',
  BOTH: 'Both',
};

export function DocTypesTable({ types }: { types: DocumentType[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (t: DocumentType) => {
    setBusy(t.id);
    startTransition(async () => {
      const result = await setDocumentTypeActiveAction({ id: t.id, isActive: !t.isActive });
      setBusy(null);
      if (result.ok) toast.success(`${t.name} ${t.isActive ? 'deactivated' : 'activated'}`);
      else toast.error(result.error.message);
    });
  };

  const columns: ColumnDef<DocumentType>[] = [
    {
      header: 'Code',
      accessorKey: 'code',
      size: 140,
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold">{row.original.code}</span>
      ),
    },
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
    },
    {
      header: 'Applies to',
      accessorKey: 'appliesTo',
      size: 120,
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full">
          {APPLIES_LABEL[row.original.appliesTo]}
        </Badge>
      ),
    },
    {
      header: 'Expiry',
      accessorKey: 'hasExpiry',
      size: 90,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.hasExpiry ? 'Tracked' : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Inactive
          </span>
        ),
    },
    {
      header: '',
      id: 'actions',
      size: 200,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy === row.original.id}
            onClick={() => toggle(row.original)}
          >
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <DocTypeDialog
            initial={row.original}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Edit ${row.original.code}`}>
                <Pencil className="size-3.5" />
              </Button>
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DocTypeDialog
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-4" /> New document type
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={types}
        emptyTitle="No document types yet"
        emptyDescription="Configure the document types Career Ireland collects (Passport, CV, Driver Licence, etc)."
      />
    </div>
  );
}
