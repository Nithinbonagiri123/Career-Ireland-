import { Briefcase, Building2, LayoutDashboard, ListChecks, Sparkles, Trophy } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchDashboardRevenue, fetchRevenueTrendBySource } from '@/modules/dashboard/revenue';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { RevenueBusinessChart } from '../revenue-business-chart';
import { StatChip } from '../stat-chip';

export const dynamic = 'force-dynamic';

export default async function RecruitmentDashboard() {
  await requirePermission('recruitment', 'dashboard', 'view');
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
          badge="Recruitment"
          title="Recruitment — today"
          description="Employer engagement, requisition pipeline, placements, and advertising."
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Recruitment' }]}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <StatChip
            label="Employers"
            value={m.employers.total}
            hint={`${m.employers.active} active`}
            href="/employers"
            icon={Building2}
          />
          <StatChip
            label="Open requisitions"
            value={m.requisitions.open + m.requisitions.inProgress}
            hint={`${m.requisitions.totalPositionsOpen} positions open`}
            href="/requisitions"
            icon={Briefcase}
          />
          <StatChip
            label="Filled last 30d"
            value={m.requisitions.filledLast30Days}
            hint="Marked FILLED in the last month"
            href="/requisitions"
            icon={ListChecks}
          />
          <StatChip
            label="Active placements"
            value={m.placements.activeConfirmed}
            hint={`${m.placements.createdLast30Days} new last 30d`}
            href="/placements"
            icon={Trophy}
          />
          <StatChip
            label="Ads active"
            value={m.ads.active}
            hint={`${m.ads.expired} expired`}
            href="/campaigns"
            icon={Sparkles}
          />
          <StatChip
            label="Ads expiring (30d)"
            value={m.ads.expiringWithin30Days}
            hint="Renewals to plan"
            href="/campaigns"
            icon={Sparkles}
            tone="warning"
          />
        </div>
      </FadeUp>
      <FadeUp delay={0.08} className="mt-8">
        <section aria-label="Recruitment revenue" className="mb-8">
          <div className="mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
              Revenue this month
            </h2>
            <p className="mt-0.5 text-[11px] text-foreground/60">
              Service mix + daily trend for placements.
            </p>
          </div>
          <RevenueBusinessChart
            source="placements"
            services={revenue.services}
            trend={revenueTrend}
          />
        </section>
      </FadeUp>
    </div>
  );
}
