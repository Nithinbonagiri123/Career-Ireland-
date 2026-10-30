'use client';

import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { DsEnumPill, enumLabel } from '@/components/ds/status-pill';
import { DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/db/schema/activities';
import { cn } from '@/lib/utils';
import { updateTaskStatusAction } from '@/modules/activities/actions';
import type { TaskRow } from '@/modules/activities/service';

const STATUS_ICON: Record<Task['status'], typeof Circle> = {
  OPEN: Circle,
  IN_PROGRESS: CircleDot,
  DONE: CheckCircle2,
  CANCELLED: Circle,
};

export function CaseTasksSection({ caseId, rows }: { caseId: string; rows: TaskRow[] }) {
  const [, startTransition] = useTransition();
  const router = useRouter();

  const setStatus = (task: TaskRow, status: Task['status']) => {
    startTransition(async () => {
      const r = await updateTaskStatusAction({ taskId: task.id, status }, [
        `/immigration/${caseId}`,
      ]);
      if (r.ok) {
        toast.success(`Task ${status.toLowerCase().replace(/_/g, ' ')}`);
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  const openCount = rows.filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length;

  return (
    <SectionCard
      icon={Clock}
      title="Tasks"
      description="Created automatically when the case opens and on every status change. Reopening a status doesn't create duplicates."
      action={
        <span className="text-xs tabular-nums text-muted-foreground">
          {openCount} open · {rows.length} total
        </span>
      }
      testId="case-tasks"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No tasks yet"
          description="Tasks appear here when the case is created or its status changes."
        />
      ) : (
        <ul className={DS_ROW_LIST}>
          {rows.map((task) => {
            const Icon = STATUS_ICON[task.status];
            const isDone = task.status === 'DONE' || task.status === 'CANCELLED';
            const overdue = !isDone && task.dueAt && isPast(new Date(task.dueAt));
            return (
              <li
                key={task.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm"
              >
                <div className="flex min-w-0 flex-1 basis-60 items-start gap-2.5">
                  <Icon
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      overdue ? 'text-destructive' : isDone ? 'text-emerald-600' : 'text-primary',
                      task.status === 'CANCELLED' && 'text-muted-foreground',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'font-medium text-foreground [overflow-wrap:anywhere]',
                        isDone && 'text-muted-foreground line-through',
                      )}
                    >
                      {task.title}
                      <span className="sr-only"> — {enumLabel(task.status)}</span>
                    </p>
                    {task.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Assigned to {task.assignedName}</span>
                      {task.dueAt && (
                        <>
                          <span aria-hidden>·</span>
                          <time
                            dateTime={new Date(task.dueAt).toISOString()}
                            className={cn(
                              'tabular-nums',
                              overdue && 'font-medium text-destructive',
                            )}
                          >
                            {overdue && (
                              <AlertTriangle className="mr-0.5 inline size-3" aria-hidden />
                            )}
                            {overdue ? 'Overdue — due ' : 'Due '}
                            {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })} ·{' '}
                            {format(new Date(task.dueAt), 'd MMM yyyy · HH:mm')}
                          </time>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DsEnumPill
                    status={task.priority}
                    label={`${enumLabel(task.priority)} priority`}
                  />
                  {!isDone && (
                    <>
                      {task.status === 'OPEN' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus(task, 'IN_PROGRESS')}
                          aria-label={`Start ${task.title}`}
                        >
                          Start
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(task, 'DONE')}
                        aria-label={`Done: ${task.title}`}
                      >
                        Done
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus(task, 'CANCELLED')}
                        aria-label={`Cancel ${task.title}`}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
