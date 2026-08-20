'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { Check, MoreHorizontal, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Payment } from '@/lib/db/schema/commerce';
import type { UserRole } from '@/lib/db/schema/users';
import { rejectPaymentAction, verifyPaymentAction } from '@/modules/commerce/actions';

const STATUS_VARIANT: Record<Payment['status'], 'default' | 'secondary' | 'outline'> = {
  PENDING: 'secondary',
  PROOF_UPLOADED: 'secondary',
  VERIFIED: 'default',
  REJECTED: 'outline',
};

type Row = Payment & { serviceName: string };

export function PaymentsTable({ payments, role }: { payments: Row[]; role: UserRole }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const verify = (p: Row) => {
    setBusy(p.id);
    startTransition(async () => {
      const r = await verifyPaymentAction({ paymentId: p.id });
      setBusy(null);
      if (r.ok) toast.success('Payment verified — engagement moved to ACTIVE');
      else toast.error(r.error.message);
    });
  };

  const reject = (p: Row) => {
    const reason = window.prompt('Reject payment. Reason? (audited)');
    if (!reason || reason.trim().length < 3) return;
    setBusy(p.id);
    startTransition(async () => {
      const r = await rejectPaymentAction({ paymentId: p.id, reason: reason.trim() });
      setBusy(null);
      if (r.ok) toast.success('Payment rejected');
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<Row>[] = [
    {
      header: 'Service',
      accessorKey: 'serviceName',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.serviceName}</span>,
    },
    {
      header: 'Amount',
      id: 'amount',
      size: 140,
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.amount} {row.original.currencyCode}
        </span>
      ),
    },
    {
      header: 'Method',
      accessorKey: 'method',
      size: 130,
      cell: ({ row }) => (
        <Badge variant="secondary" className="rounded-full text-[10px]">
          {row.original.method.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 140,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Reference',
      accessorKey: 'proofReference',
      size: 200,
      cell: ({ row }) => (
        <span className="truncate text-xs text-muted-foreground">
          {row.original.proofReference ?? '—'}
        </span>
      ),
    },
    {
      header: 'Created',
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
      size: 50,
      cell: ({ row }) => {
        const p = row.original;
        const canDecide =
          role === 'ADMIN' && (p.status === 'PENDING' || p.status === 'PROOF_UPLOADED');
        if (!canDecide) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Actions" disabled={busy === p.id} />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Payment decision</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => verify(p)}>
                <Check className="mr-2 size-4" /> Verify
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => reject(p)}>
                <X className="mr-2 size-4" /> Reject…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={payments}
      emptyTitle="No payments yet"
      emptyDescription="Record a payment against an open Service Engagement to start."
    />
  );
}
