import { format, formatDistanceToNowStrict } from 'date-fns';
import { Clock, LayoutDashboard, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { requireSession } from '@/lib/auth/session';
import {
  fetchHrDashboard,
  fetchMyRecentSessions,
  findOpenSessionForUser,
} from '@/modules/hr/service';
import { ClockPanel } from './clock-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'HR · Career Ireland' };

/**
 * Self-service HR — every staff user sees their own attendance +
 * clock in/out control. Admins get an extra link to /hr/admin at the
 * top-right of the page.
 */
export default async function HrPage() {
  const session = await requireSession();
  const [openSession, myRecent, dashboard] = await Promise.all([
    findOpenSessionForUser(session.user.id),
    fetchMyRecentSessions(session.user.id, 15),
    // fetchHrDashboard requires ADMIN|STAFF so ok for portal users
    // (which are not allowed on this route by the middleware anyway)
    session.user.role === 'ADMIN' || session.user.role === 'STAFF'
      ? fetchHrDashboard()
      : Promise.resolve(null),
  ]);

  const isAdmin = session.user.role === 'ADMIN';

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Clock}
          title="Attendance"
          description="Clock in when you start work, clock out when you're done. Every timestamp is server-side and audited."
          badge={session.user.name}
          action={
            isAdmin ? (
              <Link href="/hr/admin" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <Users className="mr-1.5 size-4" />
                Admin view
              </Link>
            ) : undefined
          }
        />
      </FadeUp>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FadeUp delay={0.05} className="lg:col-span-1">
          <ClockPanel initialOpen={openSession} />
        </FadeUp>

        <FadeUp delay={0.08} className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">My recent sessions</CardTitle>
              {dashboard && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LayoutDashboard className="size-3" />
                  {dashboard.currentlyClockedIn} across the team right now
                </div>
              )}
            </CardHeader>
            <CardContent>
              {myRecent.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No attendance yet"
                  description="Your first clock-in will show up here."
                />
              ) : (
                <ul className="divide-y">
                  {myRecent.map((s) => {
                    const active = !s.clockOutAt;
                    const durationMs = s.clockOutAt
                      ? s.clockOutAt.getTime() - s.clockInAt.getTime()
                      : 0;
                    const hours = Math.floor(durationMs / 3_600_000);
                    const minutes = Math.floor((durationMs % 3_600_000) / 60_000);
                    return (
                      <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <StatusDot tone={active ? 'success' : 'neutral'} />
                          <span>
                            {format(s.clockInAt, 'EEE d MMM')} ·{' '}
                            <span className="text-muted-foreground">
                              {format(s.clockInAt, 'HH:mm')}
                              {' – '}
                              {s.clockOutAt ? format(s.clockOutAt, 'HH:mm') : 'active'}
                            </span>
                          </span>
                          {s.autoClosed && (
                            <Badge variant="warning" className="rounded-full text-[10px]">
                              Auto-closed
                            </Badge>
                          )}
                          {s.correctionReason && (
                            <Badge variant="info" className="rounded-full text-[10px]">
                              Corrected
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {active
                            ? formatDistanceToNowStrict(s.clockInAt, { addSuffix: false })
                            : `${hours}h ${minutes}m`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </FadeUp>
      </div>
    </div>
  );
}
