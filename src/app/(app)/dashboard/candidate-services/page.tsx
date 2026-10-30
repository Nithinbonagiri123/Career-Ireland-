import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  CreditCard,
  FileText,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FOCUS_RING } from '@/components/ds/segmented';
import { StatTile } from '@/components/ds/stat-tile';
import { DsStatusPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
import { parseDateRangeParams } from '@/lib/date-range';
import { cn } from '@/lib/utils';
import { fetchRecentActivity } from '@/modules/dashboard/activity';
import { fetchDashboardRevenue, fetchRevenueTrendBySource } from '@/modules/dashboard/revenue';
import { fetchCandidateServicesDashMetrics } from '@/modules/dashboard/service';
import { ActivityFeed } from '../activity-feed';
import { CsRevenueCard } from './cs-revenue-card';

export const dynamic = 'force-dynamic';

/**
 * Stage 6G — Candidate Services Dashboard, matching the approved mockup:
 * breadcrumb + title + date range control, five tinted KPI tiles with
 * honest growth chips, the Revenue-this-month card (service-mix donut +
 * daily trend), then Recent activity | Top services this month.
 */
export default async function CandidateServicesDashboard({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requirePermission('candidate_services', 'dashboard', 'view');
  const { created, from, to } = await searchParams;
  const range = parseDateRangeParams({ created, from, to });

  const [m, revenue, revenueTrend, activity] = await Promise.all([
    fetchCandidateServicesDashMetrics(),
    fetchDashboardRevenue({ from: range.from, to: range.to }),
    fetchRevenueTrendBySource({ from: range.from, to: range.to }),
    fetchRecentActivity(5),
  ]);

  // Honest growth chips — current window vs the equivalent previous
  // window; no chip when the previous window is empty.
  const candGrowth = pctChange(m.growth.candidatesNewLast30, m.growth.candidatesNewPrev30);
  const leadsGrowth = pctChange(m.leads.lastSevenDays, m.growth.leadsPrevSevenDays);

  // Top services table — candidate services rows in the primary currency.
  const csServices = revenue.services.filter((s) => s.source === 'candidate_services');
  const currencyTotals = new Map<string, number>();
  for (const s of csServices) {
    currencyTotals.set(s.currencyCode, (currencyTotals.get(s.currencyCode) ?? 0) + s.total);
  }
  const primaryCurrency =
    [...currencyTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
  const topServices = csServices
    .filter((s) => s.currencyCode === primaryCurrency)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const topTotal = topServices.reduce((sum, s) => sum + s.total, 0);
  const topCount = topServices.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <FadeUp>
        <nav
          aria-label="Breadcrumb"
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link href="/dashboard" className="hover:text-foreground hover:underline">
            Dashboard
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-foreground">Candidate Services</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Candidate Services Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Overview of lead intake, candidate pool health and payment verification.
            </p>
          </div>
          <DateRangeFilter className="shrink-0" />
        </div>
      </FadeUp>

      {/* KPI tiles */}
      <FadeUp delay={0.05} className="mt-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiTile
            icon={Users}
            tone="blue"
            label="Total candidates"
            value={m.candidates.total}
            delta={candGrowth}
            hint={`${m.candidates.available} available · ${m.candidates.placed} placed`}
            href="/candidates"
          />
          <KpiTile
            icon={UserCheck}
            tone="green"
            label="Available now"
            value={m.candidates.available}
            hint="Searchable for new requisitions"
            href="/candidates?status=AVAILABLE"
          />
          <KpiTile
            icon={Briefcase}
            tone="purple"
            label="Placed"
            value={m.candidates.placed}
            hint={`${m.candidates.inactive} inactive / archived`}
            href="/candidates?status=PLACED"
          />
          <KpiTile
            icon={UserPlus}
            tone="amber"
            label="New leads (7D)"
            value={m.leads.lastSevenDays}
            delta={leadsGrowth}
            hint={`${m.leads.total} open · ${m.leads.awaitingPayment} awaiting payment`}
            href="/leads"
          />
          <KpiTile
            icon={CreditCard}
            tone="rose"
            label="Payments to verify"
            value={m.payments.awaitingVerification}
            hint={`${m.payments.verifiedLast30Days} verified last 30 days`}
            href="/payments"
          />
        </div>
      </FadeUp>

      {/* Revenue this month */}
      <FadeUp delay={0.08} className="mt-5">
        <CsRevenueCard
          services={revenue.services}
          trend={revenueTrend}
          totals={revenue.totalsByCurrency}
          previousTotals={revenue.previousTotalsByCurrency}
        />
      </FadeUp>

      {/* Recent activity | Top services */}
      <FadeUp delay={0.11} className="mt-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard
            icon={FileText}
            title="Recent activity"
            description="Latest actions across leads, candidates and payments."
            action={
              <Link
                href="/admin/audit"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                View all
              </Link>
            }
            bodyClassName="mt-3"
          >
            <ActivityFeed rows={activity} />
          </SectionCard>

          <SectionCard
            icon={BarChart3}
            title="Top services this month"
            description="Revenue by service and number of candidates."
            action={
              <Link href="/services" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                View all
              </Link>
            }
            bodyClassName="mt-3"
          >
            {topServices.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No verified revenue in this range yet.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">#</th>
                    <th className="py-2 pr-2 font-medium">Service</th>
                    <th className="py-2 pr-2 text-right font-medium">Revenue</th>
                    <th className="py-2 pr-2 text-right font-medium">Candidates</th>
                    <th className="w-[30%] py-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {topServices.map((s, i) => {
                    const pct = topTotal > 0 ? Math.round((s.total / topTotal) * 100) : 0;
                    return (
                      <tr key={s.serviceCode} className="border-b last:border-b-0">
                        <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="max-w-0 truncate py-2.5 pr-2 font-medium text-foreground">
                          {s.serviceName}
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-foreground">
                          {formatCurrency(String(s.total), s.currencyCode)}
                        </td>
                        <td className="py-2.5 pr-2 text-right tabular-nums text-foreground">
                          {s.count}
                        </td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
                              {pct}%
                            </span>
                            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn(
                                  'block h-full rounded-full',
                                  i === 0
                                    ? 'bg-sky-500'
                                    : i === 1
                                      ? 'bg-emerald-500'
                                      : 'bg-violet-500',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold text-foreground">
                    <td className="py-2.5 pr-2" />
                    <td className="py-2.5 pr-2">Total</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">
                      {formatCurrency(String(topTotal), primaryCurrency)}
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">{topCount}</td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      <span className="pl-0.5">100%</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
      </FadeUp>
    </div>
  );
}

/** Percent change vs the previous window; null when it can't be stated honestly. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const TILE_TONES = {
  blue: 'blue',
  green: 'green',
  purple: 'violet',
  amber: 'amber',
  rose: 'rose',
} as const satisfies Record<string, DsTone>;

/** Stage 6G summary tile that links to its list (shared StatTile). */
function KpiTile({
  icon,
  tone,
  label,
  value,
  delta,
  hint,
  href,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  label: string;
  value: number;
  /** Percent change chip; omitted when no honest comparison exists. */
  delta?: number | null;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn('block rounded-2xl transition-shadow hover:shadow-md', FOCUS_RING)}
    >
      <StatTile
        icon={icon}
        tone={TILE_TONES[tone]}
        label={label}
        value={value}
        hint={hint}
        trend={
          delta !== null && delta !== undefined ? (
            <DsStatusPill
              tone={delta > 0 ? 'green' : delta < 0 ? 'rose' : 'slate'}
              className="normal-case tracking-normal"
            >
              {delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ '}
              {delta}%
            </DsStatusPill>
          ) : undefined
        }
      />
    </Link>
  );
}
