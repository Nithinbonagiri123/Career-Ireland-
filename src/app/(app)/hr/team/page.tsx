import { format, formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, Users2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { requireSession } from '@/lib/auth/session';
import { fetchDirectReports } from '@/modules/hr/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My team · HR · Ireland Career Gateway' };

/**
 * Manager team view — shows every user whose staff_profile.manager_user_id
 * points at the caller, with each report's latest attendance state. No
 * `requireRole` gate: any internal user can visit this page and see
 * their own reports (if they have any); the query itself is scoped so
 * there's nothing to leak from someone with zero reports.
 */
export default async function HrTeamPage() {
  const session = await requireSession();
  const reports = await fetchDirectReports(session.user.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users2}
          title="My team"
          description="Attendance state for staff who report to you."
          breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'My team' }]}
          action={
            <Link href="/hr" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <ArrowLeft className="mr-1.5 size-4" />
              Back to my attendance
            </Link>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Direct reports{' '}
              <span className="text-xs font-normal text-muted-foreground">({reports.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <EmptyState
                icon={Users2}
                title="No direct reports"
                description="You'll see reports here once an admin sets your userId as their manager on their staff profile."
              />
            ) : (
              <ul className="divide-y rounded-md border">
                {reports.map((r) => {
                  const s = r.latestSession;
                  const isActive = s !== null && s.clockOutAt === null;
                  const isStale =
                    isActive &&
                    s !== null &&
                    s.clockInAt.getTime() < Date.now() - 14 * 60 * 60 * 1000;
                  return (
                    <li
                      key={r.userId}
                      className="flex items-center justify-between px-3 py-2.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <StatusDot
                          tone={
                            isStale ? 'danger' : isActive ? 'success' : s ? 'neutral' : 'neutral'
                          }
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.userName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {r.userEmail}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {s === null ? (
                          <span>No attendance yet</span>
                        ) : isActive ? (
                          <>
                            <div>
                              Since{' '}
                              <span className="font-medium text-foreground">
                                {format(s.clockInAt, 'HH:mm')}
                              </span>
                            </div>
                            <div className="text-[10px] uppercase tracking-wider">
                              {formatDistanceToNowStrict(s.clockInAt)}
                              {isStale && (
                                <Badge variant="danger" className="ml-1.5 rounded-full text-[9px]">
                                  Missing clock-out
                                </Badge>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div>Last: {format(s.clockInAt, 'EEE d MMM')}</div>
                            <div className="text-[10px] uppercase tracking-wider">
                              {format(s.clockInAt, 'HH:mm')} –{' '}
                              {s.clockOutAt ? format(s.clockOutAt, 'HH:mm') : '?'}
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
