import { AlertCircle, ArrowLeft, Coffee, LogIn, Users2 } from 'lucide-react';
import Link from 'next/link';
import {
  type AttendanceState,
  AttendanceStatePill,
  attendanceStates,
  DateTime,
  RunningDuration,
} from '@/components/ds/attendance';
import { FOCUS_RING } from '@/components/ds/segmented';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DS_ROW, DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requireSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchDirectReports } from '@/modules/hr/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My team · HR' };

/**
 * Stage 6G My team — every user whose staff profile names the caller as
 * manager, with each report's latest attendance. Scope and gate are
 * unchanged: signed-in only, query limited to the caller's own reports.
 * (A clocked-in-only "Team on duty" view is a separate proposal.)
 */
export default async function HrTeamPage() {
  const session = await requireSession();
  const reports = await fetchDirectReports(session.user.id);
  const now = new Date();

  const rows = reports.map((r) => {
    const s = r.latestSession;
    const states = s
      ? attendanceStates({
          clockInAt: s.clockInAt,
          clockOutAt: s.clockOutAt,
          autoClosed: s.autoClosed,
          correctionReason: s.correctionReason,
          onBreak: r.openBreak !== null,
          now,
        })
      : [];
    return { r, s, states };
  });
  const count = (state: AttendanceState) => rows.filter((x) => x.states.includes(state)).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users2}
          iconTone="purple"
          title="My team"
          description="Your direct reports and their latest attendance."
          breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'My team' }]}
          action={
            <Link
              href="/hr"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), FOCUS_RING)}
            >
              <ArrowLeft className="mr-1.5 size-4" aria-hidden />
              My attendance
            </Link>
          }
        />
      </FadeUp>

      {reports.length > 0 && (
        <FadeUp delay={0.04}>
          <StatTileGrid className="mb-6">
            <StatTile icon={Users2} tone="violet" label="Direct reports" value={reports.length} />
            <StatTile icon={LogIn} tone="green" label="Working now" value={count('working')} />
            <StatTile icon={Coffee} tone="amber" label="On break" value={count('on_break')} />
            <StatTile
              icon={AlertCircle}
              tone="rose"
              label="Missing clock-out"
              value={count('missing_clock_out')}
              hint="Open longer than 14 hours"
            />
          </StatTileGrid>
        </FadeUp>
      )}

      <FadeUp delay={0.07}>
        <SectionCard icon={Users2} title="Direct reports" count={reports.length}>
          {reports.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No direct reports"
              description="People appear here when their HR profile names you as their reporting manager."
            />
          ) : (
            <ul aria-label="Direct reports" className={DS_ROW_LIST}>
              {rows.map(({ r, s, states }) => (
                <li key={r.userId} className={DS_ROW}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.userName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{r.userEmail}</p>
                  </div>
                  <div className="flex w-full min-w-0 flex-col items-start gap-1 text-left text-xs text-muted-foreground sm:w-auto sm:items-end sm:text-right">
                    {s === null ? (
                      <span>No attendance yet</span>
                    ) : (
                      <>
                        <div className="flex flex-wrap justify-start gap-1 sm:justify-end">
                          {states.map((st) => (
                            <AttendanceStatePill key={st} state={st} />
                          ))}
                        </div>
                        {s.clockOutAt === null ? (
                          <span>
                            {r.openBreak ? (
                              <>
                                Break since <DateTime value={r.openBreak.breakStartedAt} />
                              </>
                            ) : (
                              <RunningDuration since={s.clockInAt} now={now} />
                            )}
                          </span>
                        ) : (
                          <span>
                            Last: <DateTime value={s.clockInAt} /> –{' '}
                            <DateTime value={s.clockOutAt} variant="time" />
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </FadeUp>
    </div>
  );
}
