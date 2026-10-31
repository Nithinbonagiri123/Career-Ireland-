import { AlertCircle, ArrowLeft, CalendarClock, Clock, LogIn, Users2 } from 'lucide-react';
import Link from 'next/link';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FOCUS_RING } from '@/components/ds/segmented';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { cn } from '@/lib/utils';
import { fetchHrDashboard, fetchRecentAttendance, fetchStaffDirectory } from '@/modules/hr/service';
import { listUsers } from '@/modules/users/repository';
import { AttendanceTable } from './attendance-table';
import { StaffDirectory } from './staff-directory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'HR Board' };

/**
 * Stage 6G HR Board — team tiles, attendance timesheet with row-level
 * corrections, and the staff directory. Gate and data are unchanged:
 * `main.hr_board.view` here and on every HR Board read in the service.
 */
export default async function HrAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requirePermission('main', 'hr_board', 'view');
  const { created, from, to } = await searchParams;
  const range = parseDateRangeParams({ created, from, to });
  const [dashboard, staff, recent, allUsers] = await Promise.all([
    fetchHrDashboard(),
    fetchStaffDirectory(),
    fetchRecentAttendance({ limit: 100, from: range.from, to: range.to }),
    listUsers(),
  ]);
  // Manager options — every internal user, portal roles excluded.
  const managerOptions = allUsers
    .filter((u) => u.role !== 'CANDIDATE' && u.role !== 'EMPLOYER' && u.isActive)
    .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users2}
          iconTone="purple"
          title="HR Board"
          description="Team attendance, corrections and the staff directory."
          breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'HR Board' }]}
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

      <FadeUp delay={0.04}>
        <StatTileGrid className="mb-6">
          <StatTile
            icon={LogIn}
            tone="green"
            label="Clocked in now"
            value={dashboard.currentlyClockedIn}
            hint="Across the whole team"
            testId="hr-kpi-clocked-in"
          />
          <StatTile
            icon={Clock}
            tone="blue"
            label="Sessions today"
            value={dashboard.todayTotal}
            hint="Started since midnight"
            testId="hr-kpi-today"
          />
          <StatTile
            icon={AlertCircle}
            tone="rose"
            label="Missing clock-outs"
            value={dashboard.missingClockOuts}
            hint="Still open from before yesterday"
            testId="hr-kpi-missing"
          />
          <StatTile
            icon={Clock}
            tone="amber"
            label="Late today"
            value={dashboard.lateToday}
            hint="Clock-in after 09:15"
            testId="hr-kpi-late"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.07} className="mb-6">
        <section aria-labelledby="hr-attendance-heading" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="hr-attendance-heading"
                className="flex items-center gap-2 text-[15px] font-semibold text-foreground"
              >
                <CalendarClock className="size-[18px] text-primary" aria-hidden />
                Attendance
                <span className="text-sm font-normal text-muted-foreground">({recent.length})</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Newest clock-in first, up to 100 sessions. Use the pencil to correct a session.
              </p>
            </div>
            <DateRangeFilter className="min-w-0 max-w-full" />
          </div>
          <AttendanceTable rows={recent} />
        </section>
      </FadeUp>

      <FadeUp delay={0.1}>
        <SectionCard
          icon={Users2}
          title="Staff directory"
          count={staff.length}
          description="Department, position, reporting manager, joining date and status."
        >
          {staff.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No staff profiles yet"
              description="HR details are added when a user is created in Admin → Users. Once a profile exists, edit it here."
              action={
                <Link
                  href="/admin/users"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), FOCUS_RING)}
                >
                  Open Admin → Users
                </Link>
              }
            />
          ) : (
            <StaffDirectory rows={staff} managers={managerOptions} />
          )}
        </SectionCard>
      </FadeUp>
    </div>
  );
}
