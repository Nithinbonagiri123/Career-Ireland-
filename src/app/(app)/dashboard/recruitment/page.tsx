import { Briefcase, Building2, LayoutDashboard, ListChecks, Sparkles, Trophy } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { StatChip } from '../stat-chip';

export const dynamic = 'force-dynamic';

export default async function RecruitmentDashboard() {
  await requireRole(['ADMIN', 'STAFF']);
  const m = await fetchDashboardMetrics();

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
    </div>
  );
}
