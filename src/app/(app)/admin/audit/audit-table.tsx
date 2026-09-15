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
import { describeEvent } from './describe';

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
    header: 'What happened',
    id: 'what',
    cell: ({ row }) => {
      const summary = describeEvent(row.original);
      const { revertsEventId, entityType, entityId } = row.original;
      // Owner cares about the sentence first. The compact entity ref
      // sits underneath — small enough not to compete but present for
      // anyone chasing a specific row.
      return (
        <div className="min-w-0">
          <div className="truncate text-sm">{summary}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono">{entityType}</span>
            <span aria-hidden>·</span>
            <span className="truncate font-mono">{entityId.slice(0, 8)}…</span>
            {revertsEventId && (
              <>
                <span aria-hidden>·</span>
                <span>
                  reverts <span className="font-mono">{revertsEventId.slice(0, 8)}…</span>
                </span>
              </>
            )}
          </div>
        </div>
      );
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
