import { CheckSquare } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchTasks } from '@/modules/activities/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CreateTaskDialog } from './create-task-dialog';
import { TasksTable } from './tasks-table';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const [tasks, users, persons, employers] = await Promise.all([
    fetchTasks(),
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
          action={<CreateTaskDialog users={users} persons={persons} employers={employers} />}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <TasksTable tasks={tasks} />
      </FadeUp>
    </div>
  );
}
