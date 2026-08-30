'use client';

import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Task } from '@/lib/db/schema/activities';
import { updateTaskStatusAction } from '@/modules/activities/actions';
import type { TaskRow } from '@/modules/activities/service';

const PRIORITY_VARIANT: Record<Task['priority'], 'default' | 'secondary' | 'outline'> = {
  LOW: 'outline',
  NORMAL: 'secondary',
  HIGH: 'default',
  URGENT: 'default',
};

const STATUS_ICON: Record<Task['status'], typeof Circle> = {
  OPEN: Circle,
  IN_PROGRESS: CircleDot,
  DONE: CheckCircle2,
  CANCELLED: Circle,
};

export function CaseTasksSection({ caseId, rows }: { caseId: string; rows: TaskRow[] }) {
  const [, startTransition] = useTransition();

  const setStatus = (task: TaskRow, status: Task['status']) => {
    startTransition(async () => {
      const r = await updateTaskStatusAction({ taskId: task.id, status }, [
        `/immigration/${caseId}`,
      ]);
      if (r.ok) toast.success(`Task ${status.toLowerCase().replace(/_/g, ' ')}`);
      else toast.error(r.error.message);
    });
  };

  const openCount = rows.filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4" /> Tasks
            <Badge variant="secondary" className="ml-1 rounded-full">
              {openCount} open · {rows.length} total
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Auto-generated on case creation + every status change. Idempotent — reopening a status
            doesn't create duplicates.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No tasks yet"
            description="Tasks appear here when the case is created or its status changes."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((task) => {
              const Icon = STATUS_ICON[task.status];
              const isDone = task.status === 'DONE' || task.status === 'CANCELLED';
              const overdue = !isDone && task.dueAt && isPast(new Date(task.dueAt));
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon
                      className={`mt-0.5 size-4 shrink-0 ${
                        isDone
                          ? 'text-muted-foreground'
                          : overdue
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium ${isDone ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>Assigned to {task.assignedName}</span>
                        {task.dueAt && (
                          <>
                            <span aria-hidden>·</span>
                            <span
                              className={overdue ? 'font-medium text-destructive' : ''}
                              title={format(new Date(task.dueAt), 'PPpp')}
                            >
                              {overdue && <AlertTriangle className="mr-0.5 inline size-3" />}
                              due {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge
                      variant={PRIORITY_VARIANT[task.priority]}
                      className="rounded-full text-[10px]"
                    >
                      {task.priority}
                    </Badge>
                    {task.status !== 'DONE' && task.status !== 'CANCELLED' && (
                      <>
                        {task.status === 'OPEN' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setStatus(task, 'IN_PROGRESS')}
                          >
                            Start
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setStatus(task, 'DONE')}>
                          Done
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus(task, 'CANCELLED')}
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
      </CardContent>
    </Card>
  );
}
