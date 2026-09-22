import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckSquare,
  Clock,
  Coins,
  FileCheck2,
  LogIn,
  PlaneTakeoff,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchAgingReport } from '@/modules/billing/aging';
import { fetchRecentActivity } from '@/modules/dashboard/activity';
import { fetchDashboardDrilldowns } from '@/modules/dashboard/drilldowns';
import { fetchDashboardPipelines } from '@/modules/dashboard/pipelines';
import { fetchDashboardRevenue, fetchRevenueTrendBySource } from '@/modules/dashboard/revenue';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { fetchDashboardTrends } from '@/modules/dashboard/trends';
import { fetchHrDashboard, fetchStaffCurrentlyWorking } from '@/modules/hr/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { ActivityFeed } from './activity-feed';
import { AgingSection } from './aging-section';
import { AttentionCard } from './attention-card';
import { DashboardDrilldownsSection } from './drilldowns-section';
import { PipelineFunnel } from './pipeline-funnel';
import { RevenueBusinessGrid } from './revenue-business-chart';
import { RevenueSection } from './revenue-section';
import { StatChip } from './stat-chip';
import { TrendChart } from './trend-chart';
import { WorkingNowCard } from './working-now-card';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requirePermission('main', 'overview', 'view');
  const { created, from, to } = await searchParams;
  const range = parseDateRangeParams({ created, from, to });
  const [
    m,
    drilldowns,
    pipelines,
    activity,
    hr,
    trends,
    revenue,
    revenueTrend,
    workingNow,
    aging,
    settings,
  ] = await Promise.all([
    fetchDashboardMetrics(),
    fetchDashboardDrilldowns(),
    fetchDashboardPipelines(),
    fetchRecentActivity(10),
    fetchHrDashboard(),
    fetchDashboardTrends(),
    fetchDashboardRevenue({ from: range.from, to: range.to }),
    fetchRevenueTrendBySource({ from: range.from, to: range.to }),
    fetchStaffCurrentlyWorking(),
    fetchAgingReport(),
    fetchAppSettings(),
  ]);

  const today = new Date();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <FadeUp className="mb-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                Overview
              </Badge>
              <span className="text-[11px] uppercase tracking-wider text-foreground/75">
                {format(today, 'EEEE, d MMM yyyy')}
              </span>
            </div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              {settings.legalName} — today
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What is happening, what needs attention, and what to do next.
            </p>
          </div>
        </div>
      </FadeUp>

      {/* ─── Row 1 · KPI strip ───────────────────────────────────── */}
      <FadeUp delay={0.04}>
        <section aria-label="Workspace totals" className="mb-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <StatChip
              label="Candidates"
              value={m.candidates.total}
              hint={`${m.candidates.available} available`}
              href="/candidates"
              icon={Users}
              noteTone="blue"
            />
            <StatChip
              label="New leads (7d)"
              value={m.leads.lastSevenDays}
              hint={`${m.leads.awaitingPayment} awaiting payment`}
              href="/leads"
              icon={UserPlus}
              noteTone="yellow"
            />
            <StatChip
              label="Employers"
              value={m.employers.total}
              hint={`${m.employers.active} active`}
              href="/employers"
              icon={Building2}
              noteTone="neutral"
            />
            <StatChip
              label="Open requisitions"
              value={m.requisitions.open + m.requisitions.inProgress}
              hint={`${m.requisitions.totalPositionsOpen} positions open`}
              href="/requisitions"
              icon={Briefcase}
              noteTone="purple"
            />
            <StatChip
              label="Active placements"
              value={m.placements.activeConfirmed}
              hint={`${m.placements.createdLast30Days} new · 30d`}
              href="/placements"
              icon={Trophy}
              noteTone="green"
            />
            <StatChip
              label="Ads expiring (30d)"
              value={m.ads.expiringWithin30Days}
              hint={`${m.ads.active} active · ${m.ads.expired} expired`}
              href="/campaigns"
              icon={Sparkles}
              noteTone="pink"
            />
          </div>
        </section>
      </FadeUp>

      {/* ─── Revenue ─────────────────────────────────────────────── */}
      <FadeUp delay={0.05}>
        <RevenueSection data={revenue} />
      </FadeUp>

      {/* ─── Revenue by business (pie + line per source) ─────────── */}
      <FadeUp delay={0.055}>
        <section aria-label="Revenue by business" className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
                Revenue by business
              </h2>
              <p className="mt-0.5 text-[11px] text-foreground/60">
                Service mix (pie) + daily trend (line) per business, primary currency shown.
              </p>
            </div>
          </div>
          <RevenueBusinessGrid services={revenue.services} trend={revenueTrend} />
        </section>
      </FadeUp>

      {/* ─── Invoice aging (AR pipeline) ─────────────────────────── */}
      <FadeUp delay={0.055} className="mt-8">
        <AgingSection report={aging} />
      </FadeUp>

      {/* ─── HR strip ────────────────────────────────────────────── */}
      <FadeUp delay={0.06}>
        <section aria-label="HR" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
              People
            </h2>
            <span className="text-[11px] text-foreground/60">
              Attendance is server-side + audited.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip
              label="Clocked in now"
              value={hr.currentlyClockedIn}
              hint="Across the internal team"
              href="/hr/admin"
              icon={LogIn}
              noteTone="green"
            />
            <StatChip
              label="Sessions today"
              value={hr.todayTotal}
              hint="Since midnight"
              href="/hr/admin"
              icon={Clock}
              noteTone="blue"
            />
            <StatChip
              label="Missing clock-outs"
              value={hr.missingClockOuts}
              hint="Open past yesterday"
              href="/hr/admin"
              icon={AlertCircle}
              noteTone="pink"
            />
            <StatChip
              label="Late today"
              value={hr.lateToday}
              hint="Clock-in after 09:15"
              href="/hr/admin"
              icon={Clock}
              noteTone="yellow"
            />
          </div>

          {/* Owner's at-a-glance view: names of everyone clocked in
              right now, whether they're on break, and their clock-in
              time. Keeps the visibility that a physical office would
              have when the owner isn't there. */}
          <div className="mt-3">
            <WorkingNowCard initial={workingNow} />
          </div>
        </section>
      </FadeUp>

      {/* ─── Row · 30-day trends ─────────────────────────────────── */}
      <FadeUp delay={0.07}>
        <section aria-label="30-day trends" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
              30-day trends
            </h2>
            <span className="text-[11px] text-foreground/60">
              Real counts, second-half vs first-half of the window.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <TrendChart
              title="New leads"
              iconEl={<UserPlus aria-hidden />}
              data={trends.leads}
              tone="info"
              href="/leads"
            />
            <TrendChart
              title="Applications"
              iconEl={<FileCheck2 aria-hidden />}
              data={trends.applications}
              tone="success"
              href="/applications"
            />
            <TrendChart
              title="Placements"
              iconEl={<Trophy aria-hidden />}
              data={trends.placements}
              tone="success"
              href="/placements"
            />
          </div>
        </section>
      </FadeUp>

      {/* ─── Row 2 · Operational pipelines ───────────────────────── */}
      <FadeUp delay={0.08}>
        <section aria-label="Operational pipelines" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
              Operational pipelines
            </h2>
            <span className="text-[11px] text-foreground/60">
              Real-time counts from the domain tables.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <PipelineFunnel
              title="Candidate journey"
              href="/candidates"
              icon={UserPlus}
              stages={pipelines.candidate}
            />
            <PipelineFunnel
              title="Application funnel"
              href="/applications"
              icon={FileCheck2}
              stages={pipelines.application}
            />
            <PipelineFunnel
              title="Requisition pipeline"
              href="/requisitions"
              icon={Briefcase}
              stages={pipelines.requisition}
            />
            <PipelineFunnel
              title="Immigration cases"
              href="/immigration"
              icon={PlaneTakeoff}
              stages={pipelines.immigration}
            />
          </div>
        </section>
      </FadeUp>

      {/* ─── Row 3 · Attention needed ────────────────────────────── */}
      <FadeUp delay={0.12}>
        <section aria-label="Attention needed" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
              Attention needed
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AttentionCard
              title="Overdue tasks"
              count={m.tasks.overdue}
              href="/tasks"
              icon={CheckSquare}
              tone="danger"
              emptyLabel="Nothing overdue. Nice."
            >
              <ul className="space-y-1.5 text-xs">
                {drilldowns.overdueTasks.slice(0, 3).map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    {t.dueAt ? (
                      <time
                        dateTime={t.dueAt.toISOString()}
                        className="flex shrink-0 flex-col items-end text-[10px] text-muted-foreground"
                      >
                        <span>{formatDistanceToNow(t.dueAt, { addSuffix: true })}</span>
                        <span className="tabular-nums text-muted-foreground/70">
                          {format(t.dueAt, "dd MMM · HH:mm")}
                        </span>
                      </time>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">no due date</span>
                    )}
                  </li>
                ))}
                {m.tasks.overdue > 3 && (
                  <li className="pt-0.5 text-[10px] text-muted-foreground">
                    +{m.tasks.overdue - 3} more
                  </li>
                )}
              </ul>
            </AttentionCard>
            <AttentionCard
              title="Payments to verify"
              count={m.payments.awaitingVerification}
              href="/payments"
              icon={Coins}
              tone="warning"
              emptyLabel="No payments awaiting verification."
            >
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">
                    {m.payments.awaitingVerification}
                  </span>{' '}
                  submitted, ready for staff review.
                </p>
                <p>{m.payments.verifiedLast30Days} verified in the last 30 days.</p>
              </div>
            </AttentionCard>
            <AttentionCard
              title="Cases expiring (60d)"
              count={m.immigration.expiringWithin60Days}
              href="/immigration"
              icon={PlaneTakeoff}
              tone="warning"
              emptyLabel="No permit/visa expiries in the next 60 days."
            >
              <ul className="space-y-1.5 text-xs">
                {drilldowns.expiringImmigrationCases.slice(0, 3).map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{c.beneficiaryName}</span>
                    <span
                      className={
                        c.daysUntilExpiry <= 14
                          ? 'shrink-0 text-[10px] text-status-danger'
                          : 'shrink-0 text-[10px] text-muted-foreground'
                      }
                    >
                      {c.daysUntilExpiry <= 0 ? 'expired' : `${c.daysUntilExpiry}d`}
                    </span>
                  </li>
                ))}
              </ul>
            </AttentionCard>
            <AttentionCard
              title="Interviews this week"
              count={drilldowns.interviewsThisWeek.length}
              href="/interviews"
              icon={Clock}
              tone="info"
              emptyLabel="Nothing on the interview calendar this week."
            >
              <ul className="space-y-1.5 text-xs">
                {drilldowns.interviewsThisWeek.slice(0, 3).map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{i.candidateName}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {format(i.scheduledAt, 'EEE HH:mm')}
                    </span>
                  </li>
                ))}
              </ul>
            </AttentionCard>
          </div>
        </section>
      </FadeUp>

      {/* ─── Row 4 · Drill-down + Activity feed ──────────────────── */}
      <FadeUp delay={0.16}>
        <section aria-label="Drill down + activity" className="mb-4">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <div className="mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
                  Drill down
                </h2>
              </div>
              <DashboardDrilldownsSection data={drilldowns} />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
                  Recent activity
                </h2>
                <span className="text-[11px] text-foreground/60">audit-backed</span>
              </div>
              <ActivityFeed rows={activity} />
            </div>
          </div>
        </section>
      </FadeUp>
    </div>
  );
}
