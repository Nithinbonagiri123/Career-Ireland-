'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import type { Currency } from '@/lib/db/schema/currencies';
import { setCurrencyActiveAction } from '@/modules/currencies/actions';
import { CurrencyDialog } from './currency-dialog';

type Props = { currencies: Currency[] };

export function CurrenciesTable({ currencies }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (c: Currency) => {
    setBusy(c.code);
    startTransition(async () => {
      const result = await setCurrencyActiveAction({ code: c.code, isActive: !c.isActive });
      setBusy(null);
      if (result.ok) {
        toast.success(`${c.code} ${c.isActive ? 'deactivated' : 'activated'}`);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const columns: ColumnDef<Currency>[] = [
    {
      header: 'Code',
      accessorKey: 'code',
      size: 80,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold">{row.original.code}</span>
      ),
    },
    {
      header: 'Name',
      accessorKey: 'name',
      cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
    },
    {
      header: 'Symbol',
      accessorKey: 'symbol',
      size: 80,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.symbol}</span>,
    },
    {
      header: 'Status',
      accessorKey: 'isActive',
      size: 110,
      cell: ({ row }) =>
        row.original.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="size-1.5 rounded-full bg-status-success" /> Active
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
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy === c.code}
              onClick={() => toggle(c)}
            >
              {c.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <CurrencyDialog
              initial={c}
              trigger={
                <Button variant="ghost" size="icon" aria-label={`Edit ${c.code}`}>
                  <Pencil className="size-3.5" />
                </Button>
              }
            />
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={currencies}
      emptyTitle="No currencies configured"
      emptyDescription="Add the currencies you accept before recording payments."
    />
  );
}
