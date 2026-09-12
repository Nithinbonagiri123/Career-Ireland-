import { CheckSquare } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchTasks } from '@/modules/activities/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CreateTaskDialog } from './create-task-dialog';
import { TasksTable } from './tasks-table';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requireInternalStaff();
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const [tasks, users, persons, employers] = await Promise.all([
    fetchTasks(createdRange),
    fetchStaffUserOptions(),
    fetchPersons(),
    fetchEmployers(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CheckSquare}
          title="Tasks & follow-ups"
          description="Sorted by status → due date. Communications with 'follow-up required' auto-create a task assigned to the logger."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CreateTaskDialog users={users} persons={persons} employers={employers} />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <TasksTable tasks={tasks} staffUsers={users} />
      </FadeUp>
    </div>
  );
}
