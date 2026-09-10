import { AlertCircle, ArrowLeft, Clock, LogIn, Users2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { fetchHrDashboard, fetchRecentAttendance, fetchStaffDirectory } from '@/modules/hr/service';
import { listUsers } from '@/modules/users/repository';
import { StatChip } from '../../dashboard/stat-chip';
import { AttendanceTable } from './attendance-table';
import { StaffDirectory } from './staff-directory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'HR admin · Ireland Career Gateway' };

/**
 * Admin HR view — dashboard tiles, staff directory, recent attendance
 * with row-level corrections. ADMIN only.
 */
export default async function HrAdminPage() {
  await requireRole(['ADMIN']);
  const [dashboard, staff, recent, allUsers] = await Promise.all([
    fetchHrDashboard(),
    fetchStaffDirectory(),
    fetchRecentAttendance(50),
    listUsers(),
  ]);
  // Manager options — every internal user, portal roles excluded.
  const managerOptions = allUsers
    .filter((u) => u.role !== 'CANDIDATE' && u.role !== 'EMPLOYER' && u.isActive)
    .map((u) => ({ id: u.id, fullName: u.fullName, email: u.email }));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users2}
          title="HR admin"
          description="Attendance, corrections, and staff directory."
          breadcrumbs={[{ label: 'HR', href: '/hr' }, { label: 'Admin' }]}
          action={
            <Link href="/hr" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <ArrowLeft className="mr-1.5 size-4" />
              Back to my attendance
            </Link>
          }
        />
      </FadeUp>

      {/* Dashboard tiles */}
      <FadeUp delay={0.05}>
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatChip
            label="Clocked in now"
            value={dashboard.currentlyClockedIn}
            hint="Across the whole team"
            href="/hr/admin"
            icon={LogIn}
          />
          <StatChip
            label="Sessions today"
            value={dashboard.todayTotal}
            hint="Started since midnight"
            href="/hr/admin"
            icon={Clock}
          />
          <StatChip
            label="Missing clock-outs"
            value={dashboard.missingClockOuts}
            hint="Left open past yesterday"
            href="/hr/admin"
            icon={AlertCircle}
            tone="warning"
          />
          <StatChip
            label="Late today"
            value={dashboard.lateToday}
            hint="Clock-in after 09:15"
            href="/hr/admin"
            icon={Clock}
            tone="warning"
          />
        </div>
      </FadeUp>

      {/* Staff directory */}
      <FadeUp delay={0.08} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Staff directory</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Every ADMIN or STAFF user. Add HR fields (department, position, joining date,
                manager) to see them here.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {staff.length === 0 ? (
              <EmptyState
                icon={Users2}
                title="No staff profiles yet"
                description="Create a profile against any internal user. The profile records department, position, joining date, and reporting manager."
              />
            ) : (
              <StaffDirectory rows={staff} managers={managerOptions} />
            )}
          </CardContent>
        </Card>
      </FadeUp>

      {/* Recent attendance with corrections */}
      <FadeUp delay={0.1}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent attendance
          </h2>
          <span className="text-[11px] text-muted-foreground">
            Server-side timestamps. Corrections audited.
          </span>
        </div>
        <AttendanceTable rows={recent} />
      </FadeUp>
    </div>
  );
}
