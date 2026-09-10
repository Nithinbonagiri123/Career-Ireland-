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
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchRecentActivity } from '@/modules/dashboard/activity';
import { fetchDashboardDrilldowns } from '@/modules/dashboard/drilldowns';
import { fetchDashboardPipelines } from '@/modules/dashboard/pipelines';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { fetchDashboardTrends } from '@/modules/dashboard/trends';
import { fetchHrDashboard } from '@/modules/hr/service';
import { ActivityFeed } from './activity-feed';
import { AttentionCard } from './attention-card';
import { DashboardDrilldownsSection } from './drilldowns-section';
import { PipelineFunnel } from './pipeline-funnel';
import { StatChip } from './stat-chip';
import { TrendChart } from './trend-chart';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireInternalStaff();
  const [m, drilldowns, pipelines, activity, hr, trends] = await Promise.all([
    fetchDashboardMetrics(),
    fetchDashboardDrilldowns(),
    fetchDashboardPipelines(),
    fetchRecentActivity(10),
    fetchHrDashboard(),
    fetchDashboardTrends(),
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
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {format(today, 'EEEE, d MMM yyyy')}
              </span>
            </div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Ireland Career Gateway — today
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
            />
            <StatChip
              label="New leads (7d)"
              value={m.leads.lastSevenDays}
              hint={`${m.leads.awaitingPayment} awaiting payment`}
              href="/leads"
              icon={UserPlus}
            />
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
              label="Active placements"
              value={m.placements.activeConfirmed}
              hint={`${m.placements.createdLast30Days} new · 30d`}
              href="/placements"
              icon={Trophy}
            />
            <StatChip
              label="Ads expiring (30d)"
              value={m.ads.expiringWithin30Days}
              hint={`${m.ads.active} active · ${m.ads.expired} expired`}
              href="/campaigns"
              icon={Sparkles}
              tone="warning"
            />
          </div>
        </section>
      </FadeUp>

      {/* ─── HR strip ────────────────────────────────────────────── */}
      <FadeUp delay={0.06}>
        <section aria-label="HR" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              People
            </h2>
            <span className="text-[11px] text-muted-foreground">
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
            />
            <StatChip
              label="Sessions today"
              value={hr.todayTotal}
              hint="Since midnight"
              href="/hr/admin"
              icon={Clock}
            />
            <StatChip
              label="Missing clock-outs"
              value={hr.missingClockOuts}
              hint="Open past yesterday"
              href="/hr/admin"
              icon={AlertCircle}
              tone="warning"
            />
            <StatChip
              label="Late today"
              value={hr.lateToday}
              hint="Clock-in after 09:15"
              href="/hr/admin"
              icon={Clock}
              tone="warning"
            />
          </div>
        </section>
      </FadeUp>

      {/* ─── Row · 30-day trends ─────────────────────────────────── */}
      <FadeUp delay={0.07}>
        <section aria-label="30-day trends" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              30-day trends
            </h2>
            <span className="text-[11px] text-muted-foreground">
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Operational pipelines
            </h2>
            <span className="text-[11px] text-muted-foreground">
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {t.dueAt ? formatDistanceToNow(t.dueAt, { addSuffix: true }) : 'no due date'}
                    </span>
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
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Drill down
                </h2>
              </div>
              <DashboardDrilldownsSection data={drilldowns} />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent activity
                </h2>
                <span className="text-[11px] text-muted-foreground">audit-backed</span>
              </div>
              <ActivityFeed rows={activity} />
            </div>
          </div>
        </section>
      </FadeUp>
    </div>
  );
}
