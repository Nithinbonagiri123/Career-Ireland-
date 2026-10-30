'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import {
  Archive,
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  CheckSquare,
  MoreHorizontal,
  Pencil,
  PlaneTakeoff,
  Play,
  User2,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table/data-table';
import { EntityCard, EntityCardGrid } from '@/components/ds/entity-card';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsEnumPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { PromptDialog } from '@/components/prompt-dialog';
import { Timestamp } from '@/components/timestamp';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { archiveTaskAction, updateTaskStatusAction } from '@/modules/activities/actions';
import type { TaskRow } from '@/modules/activities/service';
import type { UserListRow } from '@/modules/users/repository';
import { EditTaskDialog } from './edit-task-dialog';

const STATUS_TONE: Record<TaskRow['status'], DsTone> = {
  OPEN: 'blue',
  IN_PROGRESS: 'violet',
  DONE: 'green',
  CANCELLED: 'slate',
};

/**
 * The record a task belongs to, linked only where a detail page exists:
 * people → /candidates/<id> (redirects to the client workspace), employers,
 * job requisitions and immigration cases. Service engagements and
 * advertisements have no detail page of their own, so they are not linked.
 */
function linkedRecord(t: TaskRow): { href: string; label: string; icon: typeof User2 } | null {
  if (t.immigrationCaseId)
    return {
      href: `/immigration/${t.immigrationCaseId}`,
      label: 'Immigration case',
      icon: PlaneTakeoff,
    };
  if (t.jobRequisitionId)
    return { href: `/requisitions/${t.jobRequisitionId}`, label: 'Job', icon: Briefcase };
  if (t.employerId)
    return { href: `/employers/${t.employerId}`, label: 'Employer', icon: Building2 };
  if (t.personId) return { href: `/candidates/${t.personId}`, label: 'Candidate', icon: UserRound };
  return null;
}

export function TasksTable({
  tasks,
  staffUsers,
  cardView = false,
  hasAnyTasks = tasks.length > 0,
}: {
  tasks: TaskRow[];
  staffUsers: UserListRow[];
  /** `view=grid`: cards at every width. Otherwise table from md, cards on phones. */
  cardView?: boolean;
  /** False when there are no tasks at all (vs. none matching the filters). */
  hasAnyTasks?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<TaskRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TaskRow | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const setStatus = (task: TaskRow, next: TaskRow['status']) => {
    setBusy(task.id);
    startTransition(async () => {
      const r = await updateTaskStatusAction({ taskId: task.id, status: next });
      setBusy(null);
      if (r.ok) {
        toast.success(`Task ${next.toLowerCase().replace(/_/g, ' ')}`);
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  const confirmArchive = (reason: string) => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await archiveTaskAction({ taskId: target.id, reason });
      setBusy(null);
      if (r.ok) {
        toast.success('Task archived');
        setArchiveTarget(null);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  /** Row / card actions — same buttons and rules in both layouts. Every
   *  button's accessible name says which task it acts on. */
  const actionsFor = (t: TaskRow, layout: 'table' | 'card'): ReactNode => {
    const isBusy = busy === t.id;
    const isTerminal = t.status === 'DONE' || t.status === 'CANCELLED';
    return (
      <div
        className={cn(
          'flex items-center gap-1.5',
          layout === 'table' ? 'flex-nowrap justify-end' : 'flex-wrap justify-start',
        )}
      >
        {t.status === 'OPEN' && (
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            aria-label={`Start ‘${t.title}’`}
            onClick={() => setStatus(t, 'IN_PROGRESS')}
          >
            <Play className="mr-1 size-3.5" aria-hidden /> Start
          </Button>
        )}
        {!isTerminal && (
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            aria-label={`Mark ‘${t.title}’ done`}
            onClick={() => setStatus(t, 'DONE')}
          >
            <Check className="mr-1 size-3.5" aria-hidden /> Done
          </Button>
        )}
        {!isTerminal && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            aria-label={`Cancel ‘${t.title}’`}
            title="Cancel task"
            onClick={() => setStatus(t, 'CANCELLED')}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ‘${t.title}’`}
                disabled={isBusy}
              />
            }
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditTarget(t)}>
              <Pencil className="mr-2 size-4" /> Edit…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setArchiveTarget(t)}>
              <Archive className="mr-2 size-4" /> Archive…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  /** Title opens the editor — a real button, so rows / cards are reachable
   *  and operable from the keyboard with a visible focus ring. */
  const titleButton = (t: TaskRow) => (
    <button
      type="button"
      onClick={() => setEditTarget(t)}
      className={cn(
        'rounded-sm text-left text-sm font-semibold text-foreground hover:underline',
        FOCUS_RING,
      )}
    >
      {t.title}
    </button>
  );

  const recordLink = (t: TaskRow) => {
    const rec = linkedRecord(t);
    if (!rec) return null;
    const Icon = rec.icon;
    return (
      <Link
        href={rec.href}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm text-xs text-sky-700 hover:underline dark:text-sky-300',
          FOCUS_RING,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {rec.label}
      </Link>
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: actionsFor / titleButton close over busy + state setters
  const columns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        header: 'Task',
        accessorKey: 'title',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            {titleButton(row.original)}
            {row.original.description && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {row.original.description}
              </span>
            )}
            {recordLink(row.original)}
          </div>
        ),
      },
      {
        header: 'Assignee',
        accessorKey: 'assignedName',
        size: 150,
        cell: ({ row }) => <span className="text-xs">{row.original.assignedName}</span>,
      },
      {
        header: 'Priority',
        accessorKey: 'priority',
        size: 100,
        cell: ({ row }) => <DsEnumPill status={row.original.priority} />,
      },
      {
        header: 'Status',
        accessorKey: 'status',
        size: 120,
        cell: ({ row }) => <DsEnumPill status={row.original.status} />,
      },
      {
        header: 'Due',
        accessorKey: 'dueAt',
        size: 160,
        cell: ({ row }) =>
          row.original.dueAt ? (
            <Timestamp date={row.original.dueAt} />
          ) : (
            <span className="text-xs text-muted-foreground">No due date</span>
          ),
      },
      {
        header: 'Created',
        accessorKey: 'createdAt',
        size: 160,
        cell: ({ row }) => <Timestamp date={row.original.createdAt} />,
      },
      {
        header: '',
        id: 'actions',
        size: 270,
        cell: ({ row }) => actionsFor(row.original, 'table'),
      },
    ],
    [busy],
  );

  const cards = (
    <EntityCardGrid>
      {tasks.map((t) => {
        const created = new Date(t.createdAt);
        const rec = linkedRecord(t);
        return (
          <EntityCard
            key={t.id}
            testId="task-card"
            ariaLabel={`Task ${t.title}`}
            avatar={{ icon: CheckSquare, tone: STATUS_TONE[t.status] }}
            status={<DsEnumPill status={t.status} />}
            timestamp={
              <time dateTime={created.toISOString()} title={format(created, 'd MMM yyyy · HH:mm')}>
                {format(created, 'd MMM yyyy')}
              </time>
            }
            title={t.title}
            subtitle={t.description ?? undefined}
            meta={[
              { key: 'assignee', icon: User2, content: t.assignedName },
              {
                key: 'priority',
                icon: CheckSquare,
                content: (
                  <DsEnumPill status={t.priority} label={`${enumLabel(t.priority)} priority`} />
                ),
              },
              {
                key: 'due',
                icon: CalendarClock,
                content: t.dueAt ? `Due ${format(new Date(t.dueAt), 'd MMM yyyy · HH:mm')}` : null,
              },
              {
                key: 'record',
                icon: rec?.icon ?? Building2,
                content: rec ? recordLink(t) : null,
              },
            ]}
            actions={<div className="col-span-2">{actionsFor(t, 'card')}</div>}
          />
        );
      })}
    </EntityCardGrid>
  );

  return (
    <>
      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
          {hasAnyTasks ? (
            <EmptyState
              icon={CheckSquare}
              title="No tasks match these filters"
              description="Clear the filters or pick another status tab."
            />
          ) : (
            <EmptyState
              icon={CheckSquare}
              title="No tasks yet"
              description="Tasks appear here from three sources: manually created, auto-generated on immigration case status changes, and 'follow-up required' on communications."
              action={
                <Link
                  href="/communications"
                  className={buttonVariants({ size: 'sm', variant: 'outline' })}
                >
                  Log a communication <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              }
            />
          )}
        </div>
      ) : cardView ? (
        cards
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              data={tasks}
              emptyIcon={CheckSquare}
              emptyTitle="No tasks yet"
            />
          </div>
          {/* Phones: the same rows as cards, so nothing scrolls sideways. */}
          <div className="md:hidden">{cards}</div>
        </>
      )}
      <EditTaskDialog
        task={editTarget}
        users={staffUsers}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null);
        }}
      />
      <PromptDialog
        open={archiveTarget !== null}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        title={`Archive "${archiveTarget?.title ?? ''}"?`}
        description="Archived tasks disappear from the list. They can't be edited but the row + audit stay."
        label="Reason (audited)"
        placeholder="e.g. Duplicate, no longer relevant"
        confirmLabel="Archive"
        confirmVariant="destructive"
        pending={busy === archiveTarget?.id}
      />
    </>
  );
}

function enumLabel(v: string): string {
  const s = v.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
