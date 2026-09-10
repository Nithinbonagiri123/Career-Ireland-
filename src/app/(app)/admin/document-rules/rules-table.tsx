'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DocumentRequirementRule } from '@/lib/db/schema/documents';
import { deleteRequirementRuleAction } from '@/modules/documents/actions';

type Row = DocumentRequirementRule & { documentTypeCode: string; documentTypeName: string };

export function RulesTable({ rules }: { rules: Row[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const remove = (r: Row) => {
    if (!window.confirm(`Delete rule for ${r.documentTypeName}? Existing requirements stay.`))
      return;
    setBusy(r.id);
    startTransition(async () => {
      const result = await deleteRequirementRuleAction(r.id);
      setBusy(null);
      if (result.ok) toast.success('Rule deleted');
      else toast.error(result.error.message);
    });
  };

  const columns: ColumnDef<Row>[] = [
    {
      header: 'Document type',
      accessorKey: 'documentTypeName',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.documentTypeName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.original.documentTypeCode}
          </span>
        </div>
      ),
    },
    {
      header: 'Scope',
      accessorKey: 'scope',
      size: 180,
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full text-[10px]">
          {row.original.scope.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Target ID',
      accessorKey: 'scopeRefId',
      size: 260,
      cell: ({ row }) => (
        <span className="font-mono text-[10px] text-muted-foreground">
          {row.original.scopeRefId ?? '—'}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 100,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete rule"
            disabled={busy === row.original.id}
            onClick={() => remove(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rules}
      emptyTitle="No requirement rules yet"
      emptyDescription="Rules tell Ireland Career Gateway which documents a candidate needs based on their occupation, package, or globally."
    />
  );
}
