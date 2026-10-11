import { differenceInMinutes, format } from 'date-fns';
import {
  AtSign,
  Briefcase,
  Building2,
  CalendarClock,
  Clock,
  FileClock,
  PlaneTakeoff,
  ShieldCheck,
  UserCircle,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { fetchEmployeeDetail } from '@/modules/users/user-detail';
import { OwnerToggleButton } from './owner-toggle-button';

export const dynamic = 'force-dynamic';

/**
 * Phase 4 blueprint §9.2 — Employee detail page.
 *
 * The admin landing per staff member. Shows:
 *   - Profile card (name, email, role, active state, HR fields if any)
 *   - Access card (role + link to the existing permissions matrix)
 *   - Assigned Work card (count tiles into filtered list pages)
 *   - Attendance card (last 7 days total + recent sessions)
 *
 * Follows the "no DB-shaped tabs" principle — one page, four grouped
 * cards. If any of this grows, split into tabs later.
 */
export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(['ADMIN']);
  const detail = await fetchEmployeeDetail(id);
  if (!detail) notFound();
  const { user, staffProfile, assignedCounts, recentAttendance, lastSevenDaysMinutes } = detail;

  const sevenDayHours = Math.floor(lastSevenDaysMinutes / 60);
  const sevenDayMins = lastSevenDaysMinutes % 60;
  // Session 33 — current viewer must be an owner to grant/revoke the
  // owner flag; the UI below renders the toggle conditionally.
  const canToggleOwner = session.user.isOwner && session.user.id !== user.id;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserCircle}
          badge="People"
          title={user.fullName}
          description={`Employee record · joined ${format(user.createdAt, 'dd MMM yyyy')}`}
          action={
            <Link
              href="/admin/users"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Back to users
            </Link>
          }
        />
      </FadeUp>

      <FadeUp delay={0.04}>
        <Card>
          <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <CardTitle className="text-base">Profile</CardTitle>
            <div className="flex items-center gap-2">
              {user.isOwner && <Badge variant="warning">Business owner</Badge>}
              <Badge variant={user.isActive ? 'success' : 'danger'}>
                {user.isActive ? 'Active' : 'Deactivated'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field icon={AtSign} label="Email" value={user.email} />
            <Field icon={ShieldCheck} label="Role" value={user.role} />
            <Field icon={Building2} label="Department" value={staffProfile?.department ?? '—'} />
            <Field icon={Briefcase} label="Position" value={staffProfile?.position ?? '—'} />
            <Field
              icon={CalendarClock}
              label="Joining date"
              value={
                staffProfile?.joiningDate
                  ? format(new Date(staffProfile.joiningDate), 'dd MMM yyyy')
                  : '—'
              }
            />
            <Field
              icon={CalendarClock}
              label="Last signed in"
              value={
                user.lastLoginAt ? format(user.lastLoginAt, "dd MMM yyyy 'at' HH:mm") : 'Never'
              }
            />
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.08}>
        <Card>
          <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <CardTitle className="text-base">Access</CardTitle>
            <Link
              href={`/admin/users/${user.id}/permissions`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Edit permissions
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Role presets grant a baseline matrix. Open the permissions matrix to grant extra verbs
              on top, or to revoke a specific module. Changes invalidate the user's current session.
            </p>
            {canToggleOwner && (
              <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Business owner status</p>
                  <p className="text-[11px] text-muted-foreground">
                    {user.isOwner
                      ? 'This user bypasses every permission check and can reassign records. Revoking the flag immediately ends their current session.'
                      : 'Grant owner status for co-founders / partners who need bypass access and the right to reassign records.'}
                  </p>
                </div>
                <OwnerToggleButton
                  userId={user.id}
                  userName={user.fullName}
                  currentIsOwner={user.isOwner}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.12}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assigned work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Tiles link to the top-level list page (where the operator
                   can scope-filter further). The counts themselves are
                   this user's assignment totals derived server-side. */}
              <WorkTile
                icon={Users}
                label="Candidates"
                count={assignedCounts.candidates}
                href="/candidates"
              />
              <WorkTile
                icon={Building2}
                label="Employers"
                count={assignedCounts.employers}
                href="/employers"
              />
              <WorkTile
                icon={Briefcase}
                label="Open requisitions"
                count={assignedCounts.requisitions}
                href="/requisitions"
              />
              <WorkTile
                icon={PlaneTakeoff}
                label="Open cases"
                count={assignedCounts.immigrationCases}
                href="/immigration"
              />
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.16}>
        <Card>
          <CardHeader className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <CardTitle className="text-base">Attendance</CardTitle>
            <p className="text-xs text-muted-foreground">
              {sevenDayHours}h {sevenDayMins}m logged in the last 7 days
            </p>
          </CardHeader>
          <CardContent>
            {recentAttendance.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No clock-ins yet"
                description="Sessions appear here once this employee uses the clock-in widget."
              />
            ) : (
              <ul className="divide-y rounded-md border">
                {recentAttendance.map((s) => {
                  const minutes = s.clockOutAt
                    ? differenceInMinutes(s.clockOutAt, s.clockInAt)
                    : null;
                  const h = minutes != null ? Math.floor(minutes / 60) : null;
                  const m = minutes != null ? minutes % 60 : null;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <FileClock className="size-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            In <Timestamp date={s.clockInAt} />
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.clockOutAt ? (
                              <>
                                Out <Timestamp date={s.clockOutAt} />
                              </>
                            ) : (
                              <span className="text-status-success">Currently clocked in</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {minutes != null ? `${h}h ${m}m` : '—'}
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
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function WorkTile({
  icon: Icon,
  label,
  count,
  href,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  href: string;
}) {
  const empty = count === 0;
  return (
    <Link
      href={href}
      className={`group rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30 ${
        empty ? 'opacity-70' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{count}</p>
    </Link>
  );
}
