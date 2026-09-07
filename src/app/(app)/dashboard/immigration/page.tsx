import { AlertCircle, LayoutDashboard, PlaneTakeoff } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { StatChip } from '../stat-chip';

export const dynamic = 'force-dynamic';

export default async function ImmigrationDashboard() {
  await requireRole(['ADMIN', 'STAFF']);
  const m = await fetchDashboardMetrics();

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
    </div>
  );
}
