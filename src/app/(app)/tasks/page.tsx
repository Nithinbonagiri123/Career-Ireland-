import { AlertTriangle, CheckCircle2, CheckSquare, CircleDot, Play } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { readMulti } from '@/components/ds/params';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchTasks, type TaskRow } from '@/modules/activities/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CreateTaskDialog } from './create-task-dialog';
import { TasksTable } from './tasks-table';

export const dynamic = 'force-dynamic';

type SP = {
  created?: string;
  from?: string;
  to?: string;
  q?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  sort?: string;
  page?: string;
  per?: string;
  view?: string;
};

const STATUS_TABS = [
  { key: 'all', label: 'All', match: (_: TaskRow['status']) => true },
  { key: 'OPEN', label: 'Open', tone: 'blue', match: (s: TaskRow['status']) => s === 'OPEN' },
  {
    key: 'IN_PROGRESS',
    label: 'In progress',
    tone: 'violet',
    match: (s: TaskRow['status']) => s === 'IN_PROGRESS',
  },
  { key: 'DONE', label: 'Done', tone: 'green', match: (s: TaskRow['status']) => s === 'DONE' },
  {
    key: 'CANCELLED',
    label: 'Cancelled',
    tone: 'slate',
    match: (s: TaskRow['status']) => s === 'CANCELLED',
  },
] as const;

const SORTS = [
  { value: 'status', label: 'Status, then due date' },
  { value: 'due', label: 'Due soonest' },
  { value: 'recent', label: 'Recently created' },
  { value: 'priority', label: 'Highest priority' },
];
const PER_OPTIONS = [25, 50, 100];
const PRIORITY_OPTIONS = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'LOW', label: 'Low' },
];
const STATUS_RANK: Record<TaskRow['status'], number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  CANCELLED: 3,
};
const PRIORITY_RANK: Record<TaskRow['priority'], number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const isTerminal = (t: TaskRow) => t.status === 'DONE' || t.status === 'CANCELLED';

/**
 * Stage 6G — Activities (tasks & follow-ups). Same list pattern as the
 * Recruitment and Candidate Services lists: header with the primary action,
 * KPI tiles, created-date + view row, filter toolbar, status tabs + sort,
 * table (md+) / cards (phones), pagination. Every choice lives in the URL.
 * Access and the task set are unchanged (immigration.activities.view, all
 * live tasks) — filtering here only narrows what was already fetched.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('immigration', 'activities', 'view');
  const sp = await searchParams;
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  const [tasks, users, persons, employers] = await Promise.all([
    fetchTasks(createdRange),
    fetchStaffUserOptions(),
    fetchPersons(),
    fetchEmployers(),
  ]);

  // ── KPI tiles over the created-date range.
  const now = Date.now();
  const openCount = tasks.filter((t) => t.status === 'OPEN').length;
  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const overdueCount = tasks.filter(
    (t) => !isTerminal(t) && t.dueAt && new Date(t.dueAt).getTime() < now,
  ).length;
  const doneCount = tasks.filter((t) => t.status === 'DONE').length;

  // ── Filters (search / priority / assignee), then status tab, sort, page.
  const q = (sp.q ?? '').trim().toLowerCase();
  const priorities = new Set(readMulti(sp.priority));
  const assignees = new Set(readMulti(sp.assignee));
  const filtered = tasks.filter(
    (t) =>
      (!q || [t.title, t.description ?? '', t.assignedName].join(' ').toLowerCase().includes(q)) &&
      (priorities.size === 0 || priorities.has(t.priority)) &&
      (assignees.size === 0 || assignees.has(t.assignedUserId)),
  );
  const tab = STATUS_TABS.find((t) => t.key === sp.status) ?? STATUS_TABS[0];
  const tabbed = filtered.filter((t) => tab.match(t.status));
  const sorted = sortTasks(tabbed, sp.sort);
  const pageData = paginate(sorted, sp.page, sp.per, PER_OPTIONS);
  const cardView = sp.view === 'grid';

  const assigneeOptions = Array.from(new Map(tasks.map((t) => [t.assignedUserId, t.assignedName])))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CheckSquare}
          iconTone="yellow"
          title="Tasks & follow-ups"
          description="Manual tasks, tasks created by immigration case status changes, and follow-ups from logged communications."
          action={<CreateTaskDialog users={users} persons={persons} employers={employers} />}
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={CircleDot}
            tone="blue"
            label="Open"
            value={openCount}
            hint="Not started yet"
          />
          <StatTile
            icon={Play}
            tone="violet"
            label="In progress"
            value={inProgressCount}
            hint="Being worked on"
          />
          <StatTile
            icon={AlertTriangle}
            tone={overdueCount > 0 ? 'rose' : 'slate'}
            label="Overdue"
            value={overdueCount}
            hint="Past due and not finished"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Done"
            value={doneCount}
            hint="Completed in this range"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <DateRangeFilter className="min-w-0 max-w-full" />
          <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="table" />
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search tasks by title, details or assignee…"
            selects={[
              {
                param: 'priority',
                label: 'Priority',
                multiple: true,
                options: [{ value: '', label: 'Any priority' }, ...PRIORITY_OPTIONS],
              },
              {
                param: 'assignee',
                label: 'Assignee',
                multiple: true,
                options: [{ value: '', label: 'Anyone' }, ...assigneeOptions],
              },
            ]}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Task status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count: filtered.filter((x) => t.match(x.status)).length,
            }))}
            sort={SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="mt-4">
          <TasksTable
            tasks={pageData.items}
            staffUsers={users}
            cardView={cardView}
            hasAnyTasks={tasks.length > 0}
          />
          <Pagination
            basePath="/tasks"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="tasks"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}

function sortTasks(rows: TaskRow[], sort: string | undefined): TaskRow[] {
  const copy = [...rows];
  const due = (t: TaskRow) => (t.dueAt ? new Date(t.dueAt).getTime() : Number.POSITIVE_INFINITY);
  const created = (t: TaskRow) => new Date(t.createdAt).getTime();
  switch (sort) {
    case 'due':
      return copy.sort((a, b) => due(a) - due(b));
    case 'recent':
      return copy.sort((a, b) => created(b) - created(a));
    case 'priority':
      return copy.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || due(a) - due(b),
      );
    default:
      // Open first, then in progress, done, cancelled → due date → newest.
      return copy.sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          due(a) - due(b) ||
          created(b) - created(a),
      );
  }
}
