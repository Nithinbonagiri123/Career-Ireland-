'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Check, CheckSquare, Play, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { updateTaskStatusAction } from '@/modules/activities/actions';
import type { TaskRow } from '@/modules/activities/service';

const STATUS_VARIANT: Record<TaskRow['status'], 'default' | 'secondary' | 'outline'> = {
  OPEN: 'secondary',
  IN_PROGRESS: 'default',
  DONE: 'outline',
  CANCELLED: 'outline',
};

const PRIORITY_VARIANT: Record<TaskRow['priority'], 'default' | 'secondary' | 'outline'> = {
  LOW: 'outline',
  NORMAL: 'secondary',
  HIGH: 'default',
  URGENT: 'default',
};

export function TasksTable({ tasks }: { tasks: TaskRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStatus = (task: TaskRow, next: TaskRow['status']) => {
    setBusy(task.id);
    startTransition(async () => {
      const r = await updateTaskStatusAction({ taskId: task.id, status: next });
      setBusy(null);
      if (r.ok) toast.success(`Task ${next.toLowerCase().replace(/_/g, ' ')}`);
      else toast.error(r.error.message);
    });
  };

  const columns: ColumnDef<TaskRow>[] = [
    {
      header: 'Task',
      accessorKey: 'title',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.title}</span>
          {row.original.description && (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {row.original.description}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Assignee',
      accessorKey: 'assignedName',
      size: 160,
      cell: ({ row }) => <span className="text-xs">{row.original.assignedName}</span>,
    },
    {
      header: 'Priority',
      accessorKey: 'priority',
      size: 100,
      cell: ({ row }) => (
        <Badge
          variant={PRIORITY_VARIANT[row.original.priority]}
          className="rounded-full text-[10px]"
        >
          {row.original.priority}
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      size: 130,
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]} className="rounded-full">
          {row.original.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      header: 'Due',
      accessorKey: 'dueAt',
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.dueAt ? formatDistanceToNow(row.original.dueAt, { addSuffix: true }) : '—'}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      size: 200,
      cell: ({ row }) => {
        const t = row.original;
        const isBusy = busy === t.id;
        const isTerminal = t.status === 'DONE' || t.status === 'CANCELLED';
        return (
          <div className="flex items-center justify-end gap-1.5">
            {t.status === 'OPEN' && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => setStatus(t, 'IN_PROGRESS')}
              >
                <Play className="mr-1 size-3.5" /> Start
              </Button>
            )}
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => setStatus(t, 'DONE')}
              >
                <Check className="mr-1 size-3.5" /> Done
              </Button>
            )}
            {!isTerminal && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => setStatus(t, 'CANCELLED')}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={tasks}
      emptyIcon={CheckSquare}
      emptyTitle="No tasks yet"
      emptyDescription="Tasks appear here from three sources: manually created, auto-generated on immigration case status changes, and 'follow-up required' on communications."
      emptyAction={
        <Link href="/communications" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          Log a communication <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      }
    />
  );
}
