import { CalendarClock, Plus } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { buttonVariants } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { listUpcomingInterviews } from '@/modules/interviews/service';
import { InterviewsCalendar } from './calendar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Interviews · Career Ireland' };

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string }>;
}) {
  await requireRole(['ADMIN', 'STAFF']);
  const { assigned } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const interviews = await listUpcomingInterviews({ scope });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CalendarClock}
          title="Interviews"
          description="Upcoming and recent interviews across every application. Click a row to open the application and log the outcome. Interviews are always scheduled from an application — pick one to start."
          action={
            <div className="flex items-center gap-2">
              <ScopeFilter current={scope} />
              <Link
                href="/applications"
                className={buttonVariants({ variant: 'default', size: 'default' })}
              >
                <Plus className="mr-1.5 size-4" />
                Schedule from an application
              </Link>
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <InterviewsCalendar interviews={interviews} />
      </FadeUp>
    </div>
  );
}
