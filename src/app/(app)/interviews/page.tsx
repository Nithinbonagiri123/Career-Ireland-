import { AlertTriangle, ArrowRight, CalendarClock, Plus, User } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Timestamp } from '@/components/timestamp';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import {
  listApplicationsAwaitingInterview,
  listUpcomingInterviews,
} from '@/modules/interviews/service';
import { InterviewsCalendar } from './calendar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Interviews' };

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string }>;
}) {
  await requirePermission('recruitment', 'interviews', 'view');
  const { assigned } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const [interviews, awaitingApps] = await Promise.all([
    listUpcomingInterviews({ scope }),
    listApplicationsAwaitingInterview({ scope }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CalendarClock}
          iconTone="purple"
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
      {awaitingApps.length > 0 && (
        <FadeUp delay={0.04}>
          <Card className="border-status-warning/30 bg-status-warning/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-status-warning" />
                {awaitingApps.length} waiting to be scheduled
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                These candidates were moved to the Interview stage on their requisition pipeline but
                no interview time was set. Open the application to pick a date, mode, and
                interviewer — they'll appear in the calendar below once scheduled.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-status-warning/20">
                {awaitingApps.map((a) => (
                  <li key={a.applicationId} className="flex items-center gap-3 py-2 first:pt-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-status-warning/15 text-status-warning">
                      <User className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {a.candidateName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.jobLabel}
                        {a.employerLabel ? ` · ${a.employerLabel}` : ''}
                        {a.isExternal ? ' · external' : ''}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Promoted
                      </p>
                      <Timestamp date={a.promotedAt} absoluteOnly />
                    </div>
                    <Link
                      href={`/applications/${a.applicationId}`}
                      className="inline-flex items-center gap-1 rounded-md border border-status-warning/40 bg-background px-2.5 py-1 text-xs font-medium text-status-warning transition-colors hover:bg-status-warning/10"
                    >
                      Schedule now <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </FadeUp>
      )}
      <FadeUp delay={0.05}>
        <InterviewsCalendar interviews={interviews} />
      </FadeUp>
    </div>
  );
}
