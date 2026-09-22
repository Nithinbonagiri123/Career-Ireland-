import { AlertCircle, LayoutDashboard, PlaneTakeoff } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchDashboardRevenue, fetchRevenueTrendBySource } from '@/modules/dashboard/revenue';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { RevenueBusinessChart } from '../revenue-business-chart';
import { StatChip } from '../stat-chip';

export const dynamic = 'force-dynamic';

export default async function ImmigrationDashboard() {
  await requirePermission('immigration', 'dashboard', 'view');
  const [m, revenue, revenueTrend] = await Promise.all([
    fetchDashboardMetrics(),
    fetchDashboardRevenue(),
    fetchRevenueTrendBySource(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={LayoutDashboard}
          badge="Immigration"
          title="Immigration — today"
          description="Employment permits, visas, and visa extensions. Renewals surfaced 60 days ahead."
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Immigration' }]}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatChip
            label="Open cases"
            value={m.immigration.open}
            hint="Cases in OPEN status"
            href="/immigration"
            icon={PlaneTakeoff}
          />
          <StatChip
            label="Submitted / in review"
            value={m.immigration.submitted}
            hint="Awaiting authority decision"
            href="/immigration"
            icon={PlaneTakeoff}
          />
          <StatChip
            label="Expiring (60d)"
            value={m.immigration.expiringWithin60Days}
            hint="Renewals to plan"
            href="/immigration"
            icon={AlertCircle}
            tone="warning"
          />
        </div>
      </FadeUp>
      <FadeUp delay={0.08} className="mt-8">
        <section aria-label="Immigration revenue" className="mb-8">
          <div className="mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
              Revenue this month
            </h2>
            <p className="mt-0.5 text-[11px] text-foreground/60">
              Service mix + daily trend for immigration cases.
            </p>
          </div>
          <RevenueBusinessChart
            source="immigration"
            services={revenue.services}
            trend={revenueTrend}
          />
        </section>
      </FadeUp>
    </div>
  );
}
