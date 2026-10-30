import type { LucideIcon } from 'lucide-react';
import { CalendarClock, LayoutDashboard, PlaneTakeoff, Send } from 'lucide-react';
import Link from 'next/link';
import { FOCUS_RING } from '@/components/ds/segmented';
import { StatTile } from '@/components/ds/stat-tile';
import type { DsTone } from '@/components/ds/tones';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchDashboardRevenue, fetchRevenueTrendBySource } from '@/modules/dashboard/revenue';
import { fetchImmigrationDashMetrics } from '@/modules/dashboard/service';
import { RevenueBusinessChart } from '../revenue-business-chart';

export const dynamic = 'force-dynamic';

/**
 * Stage 6G Immigration dashboard. Each tile links to the cases list
 * already filtered to what the tile counts (Global scope, since the
 * counts cover every case).
 */
export default async function ImmigrationDashboard() {
  await requirePermission('immigration', 'dashboard', 'view');
  const [m, revenue, revenueTrend] = await Promise.all([
    fetchImmigrationDashMetrics(),
    fetchDashboardRevenue(),
    fetchRevenueTrendBySource(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            icon={PlaneTakeoff}
            tone="blue"
            label="New cases"
            value={m.immigration.open}
            hint="Opened, documents not started"
            href="/immigration?assigned=all&stage=new"
          />
          <KpiTile
            icon={Send}
            tone="violet"
            label="Application in progress"
            value={m.immigration.submitted}
            hint="Submitted or awaiting a decision"
            href="/immigration?assigned=all&stage=in_progress"
          />
          <KpiTile
            icon={CalendarClock}
            tone="amber"
            label="Expiring in 60 days"
            value={m.immigration.expiringWithin60Days}
            hint="Renewals to plan"
            href="/immigration?assigned=all&expiring=60"
          />
        </div>
      </FadeUp>
      <FadeUp delay={0.08} className="mt-8">
        {/* The chart draws its own card, so the heading sits above it rather
            than wrapping it in a second card. */}
        <section aria-labelledby="imm-revenue-heading" className="mb-8">
          <div className="mb-3">
            <h2 id="imm-revenue-heading" className="text-[15px] font-semibold text-foreground">
              Revenue this month
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Service mix and daily trend for immigration cases.
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

/** Summary tile that links to its filtered list (same as the CS dashboard). */
function KpiTile({
  icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  tone: DsTone;
  label: string;
  value: number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      data-testid="imm-dash-tile"
      className={cn('block rounded-2xl transition-shadow hover:shadow-md', FOCUS_RING)}
    >
      <StatTile icon={icon} tone={tone} label={label} value={value} hint={hint} />
    </Link>
  );
}
