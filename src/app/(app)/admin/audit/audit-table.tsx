'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ShieldCheck, User } from 'lucide-react';
import { useState, useTransition } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { loadMoreAuditEventsAction } from '@/modules/audit/actions';
import type { AuditEventWithActor } from '@/modules/audit/repository';
import type { AuditListQuery } from '@/modules/audit/schemas';

type Props = {
  initialItems: AuditEventWithActor[];
  initialCursor: AuditListQuery['cursor'] | null;
};

const columns: ColumnDef<AuditEventWithActor>[] = [
  {
    header: 'When',
    accessorKey: 'occurredAt',
    size: 140,
    cell: ({ row }) => {
      const d = row.original.occurredAt;
      return (
        <span className="text-xs text-muted-foreground" title={d.toLocaleString()}>
          {formatDistanceToNow(d, { addSuffix: true })}
        </span>
      );
    },
  },
  {
    header: 'Actor',
    accessorKey: 'actorName',
    size: 200,
    cell: ({ row }) => {
      const { actorName, actorEmail } = row.original;
      if (!actorEmail) {
        return (
          <Badge variant="outline" className="rounded-full text-[10px]">
            SYSTEM
          </Badge>
        );
      }
      return (
        <div className="flex items-center gap-2 text-xs">
          <User className="size-3.5 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium">{actorName ?? actorEmail}</div>
            <div className="truncate text-[10px] text-muted-foreground">{actorEmail}</div>
          </div>
        </div>
      );
    },
  },
  {
    header: 'Entity',
    accessorKey: 'entityType',
    size: 160,
    cell: ({ row }) => (
      <div className="flex flex-col text-xs">
        <span className="font-mono">{row.original.entityType}</span>
        <span className="truncate text-[10px] text-muted-foreground">{row.original.entityId}</span>
      </div>
    ),
  },
  {
    header: 'Action',
    accessorKey: 'action',
    size: 160,
    cell: ({ row }) => (
      <Badge variant="secondary" className="rounded-full text-[10px]">
        {row.original.action}
      </Badge>
    ),
  },
  {
    header: 'Details',
    id: 'details',
    cell: ({ row }) => {
      const { context, revertsEventId } = row.original;
      if (revertsEventId) {
        return (
          <span className="text-xs text-muted-foreground">
            reverts <span className="font-mono">{revertsEventId.slice(0, 8)}…</span>
          </span>
        );
      }
      if (context && typeof context === 'object') {
        const keys = Object.keys(context as Record<string, unknown>);
        if (keys.length > 0) {
          return (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {keys
                .map((k) => `${k}=${JSON.stringify((context as Record<string, unknown>)[k])}`)
                .join(' · ')}
            </span>
          );
        }
      }
      return <span className="text-xs text-muted-foreground">—</span>;
    },
  },
];

export function AuditTable({ initialItems, initialCursor }: Props) {
  const [items, setItems] = useState<AuditEventWithActor[]>(initialItems);
  const [cursor, setCursor] = useState<AuditListQuery['cursor'] | null>(initialCursor);
  const [pending, startTransition] = useTransition();

  const loadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      const result = await loadMoreAuditEventsAction({ limit: 50, cursor });
      if (result.ok) {
        setItems((prev) => [...prev, ...result.data.items]);
        setCursor(result.data.nextCursor);
      }
    });
  };

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={items}
        emptyIcon={ShieldCheck}
        emptyTitle="No audit events yet"
        emptyDescription="Business-critical mutations will appear here as staff use the app."
      />
      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
