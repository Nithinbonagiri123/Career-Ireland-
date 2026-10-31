import { Clock, History, Users } from 'lucide-react';
import Link from 'next/link';
import {
  AttendanceStatePill,
  attendanceStates,
  DateTime,
  Duration,
  RunningDuration,
} from '@/components/ds/attendance';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DS_ROW, DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { checkPermission, requireSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchHrDashboard, fetchMyRecentSessions, fetchMyTodayStatus } from '@/modules/hr/service';
import { ClockPanel } from './clock-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My attendance' };

/**
 * Stage 6G My attendance — every staff user sees their own clock card and
 * recent sessions. Admins get a link to the HR Board (same role check as
 * before). Data and gates are unchanged.
 */
export default async function HrPage() {
  const session = await requireSession();
  // The team-wide count is HR Board data (main.hr_board.view or owner);
  // everyone else sees only their own attendance.
  const canViewTeam = await checkPermission('main', 'hr_board', 'view');
  const [todayStatus, myRecent, dashboard] = await Promise.all([
    fetchMyTodayStatus(session.user.id),
    fetchMyRecentSessions(session.user.id, 15),
    canViewTeam ? fetchHrDashboard() : Promise.resolve(null),
  ]);

  const isAdmin = session.user.role === 'ADMIN';
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Clock}
          iconTone="blue"
          title="My attendance"
          description="Clock in when you start work and clock out when you're done."
          badge={session.user.name}
          action={
            isAdmin ? (
              <Link
                href="/hr/admin"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), FOCUS_RING)}
              >
                <Users className="mr-1.5 size-4" aria-hidden />
                HR Board
              </Link>
            ) : undefined
          }
        />
      </FadeUp>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FadeUp delay={0.05} className="min-w-0 lg:col-span-1">
          <ClockPanel initial={todayStatus} />
        </FadeUp>

        <FadeUp delay={0.08} className="min-w-0 lg:col-span-2">
          <SectionCard
            icon={History}
            title="My recent sessions"
            count={myRecent.length}
            action={
              dashboard ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-foreground/80">
                  <Users className="size-3.5 text-sky-600" aria-hidden />
                  {dashboard.currentlyClockedIn} across the team right now
                </span>
              ) : undefined
            }
          >
            {myRecent.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No attendance yet"
                description="Your first clock-in will show up here."
              />
            ) : (
              <ul aria-label="My recent sessions" className={DS_ROW_LIST}>
                {myRecent.map((s) => {
                  const active = !s.clockOutAt;
                  // Same arithmetic as before: clock-out − clock-in for closed sessions.
                  const durationMs = s.clockOutAt
                    ? s.clockOutAt.getTime() - s.clockInAt.getTime()
                    : 0;
                  const states = attendanceStates({
                    clockInAt: s.clockInAt,
                    clockOutAt: s.clockOutAt,
                    autoClosed: s.autoClosed,
                    correctionReason: s.correctionReason,
                    now,
                  }).filter((st) => st !== 'clocked_out');
                  return (
                    <li key={s.id} className={DS_ROW}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          <DateTime value={s.clockInAt} variant="date" />
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          <DateTime value={s.clockInAt} variant="time" />
                          {' – '}
                          {s.clockOutAt ? (
                            <DateTime value={s.clockOutAt} variant="time" />
                          ) : (
                            'still open'
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {states.map((st) => (
                          <AttendanceStatePill
                            key={st}
                            state={st}
                            // "Working" is reserved for the Today card's live state.
                            label={st === 'working' ? 'Active' : undefined}
                          />
                        ))}
                        <span className="text-xs text-muted-foreground">
                          {active ? (
                            <RunningDuration since={s.clockInAt} now={now} />
                          ) : (
                            <Duration ms={durationMs} className="font-medium text-foreground" />
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </FadeUp>
      </div>
    </div>
  );
}
