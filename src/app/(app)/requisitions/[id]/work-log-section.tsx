'use client';

import { format } from 'date-fns';
import { CheckCircle2, Circle, ClipboardList, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { seedRequisitionWorkLogAction, updateTaskStatusAction } from '@/modules/activities/actions';
import type { TaskRow } from '@/modules/activities/service';

/**
 * Phase 2 blueprint §1.3 — per-requisition Work Log.
 *
 * The pipeline wall shows "who is at what stage"; the Work Log shows
 * "what work has been done to get there". Backed by the existing tasks
 * table — each milestone is a task tied to the requisition. Operator
 * seeds 6 standard milestones on first use, ticks them off as the
 * requisition progresses, and can add their own ad-hoc tasks.
 *
 * Progress bar reads the ratio of DONE tasks over total non-cancelled
 * tasks. Operations manager can scan the strip across many
 * requisitions to see which ones are stalled.
 */
export function WorkLogSection({
  requisitionId,
  tasks,
  canEdit = true,
}: {
  requisitionId: string;
  tasks: TaskRow[];
  /** R6 — recruitment.requisitions edit; read-only milestones when false. */
  canEdit?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, update: TaskRow) => {
    return state.map((t) => (t.id === update.id ? update : t));
  });
  const [seeding, startSeedTransition] = useTransition();
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [, startStatusTransition] = useTransition();
  const router = useRouter();

  const activeTasks = optimistic.filter((t) => t.status !== 'CANCELLED');
  const doneCount = activeTasks.filter((t) => t.status === 'DONE').length;
  const total = activeTasks.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const onSeed = () => {
    startSeedTransition(async () => {
      const r = await seedRequisitionWorkLogAction(requisitionId);
      if (r.ok) {
        toast.success(
          r.data.length > 0
            ? `${r.data.length} standard milestone${r.data.length === 1 ? '' : 's'} added`
            : 'Standard milestones already exist',
        );
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const toggleTask = (task: TaskRow) => {
    const nextStatus = task.status === 'DONE' ? 'OPEN' : 'DONE';
    setPendingTaskId(task.id);
    startStatusTransition(async () => {
      setOptimistic({ ...task, status: nextStatus });
      const r = await updateTaskStatusAction({ taskId: task.id, status: nextStatus });
      setPendingTaskId(null);
      if (!r.ok) {
        toast.error(r.error.message);
        setOptimistic(task); // revert
      } else {
        router.refresh();
      }
    });
  };

  if (total === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Work log</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Standard recruitment milestones. Tick them off as the work gets done.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onSeed} disabled={seeding}>
              {seeding ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-4" />
              )}
              Add standard checklist
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-md border border-dashed border-border/70 px-4 py-6 text-xs text-muted-foreground">
            <ClipboardList className="size-5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">No work log yet.</p>
              <p>
                Click Add standard checklist to seed Source candidates / Shortlist / Schedule
                interviews / Send offer / Collect documentation / Confirm placement — or create your
                own tasks from the Tasks page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Work log</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doneCount} of {total} milestones complete.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={onSeed} disabled={seeding}>
              {seeding ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-4" />
              )}
              Add missing standards
            </Button>
          )}
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% complete`}
        >
          <span
            className="block h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {activeTasks.map((task) => {
            const isDone = task.status === 'DONE';
            const isPending = pendingTaskId === task.id;
            return (
              <li key={task.id} className="flex items-start gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  disabled={isPending || !canEdit}
                  aria-label={isDone ? `Mark ${task.title} as open` : `Mark ${task.title} as done`}
                  className={cn(
                    'mt-0.5 shrink-0 transition-colors',
                    isDone ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground',
                    isPending && 'opacity-50',
                  )}
                >
                  {isDone ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-medium leading-snug',
                      isDone && 'text-muted-foreground line-through',
                    )}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p
                      className={cn(
                        'mt-0.5 text-xs text-muted-foreground',
                        isDone && 'line-through',
                      )}
                    >
                      {task.description}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono uppercase tracking-wide">{task.priority}</span>
                    <span aria-hidden>·</span>
                    <span>Assigned to {task.assignedName}</span>
                    {task.dueAt && (
                      <>
                        <span aria-hidden>·</span>
                        <time className="tabular-nums" dateTime={task.dueAt.toISOString()}>
                          due {format(task.dueAt, 'd MMM')}
                        </time>
                      </>
                    )}
                    {isDone && task.completedAt && (
                      <>
                        <span aria-hidden>·</span>
                        <time
                          className="tabular-nums text-emerald-600"
                          dateTime={task.completedAt.toISOString()}
                        >
                          done {format(task.completedAt, 'd MMM')}
                        </time>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
