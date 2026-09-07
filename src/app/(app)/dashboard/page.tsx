import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckSquare,
  Clock,
  Coins,
  PlaneTakeoff,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { requireRole } from '@/lib/auth/session';
import { fetchDashboardDrilldowns } from '@/modules/dashboard/drilldowns';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { AttentionCard } from './attention-card';
import { DashboardDrilldownsSection } from './drilldowns-section';
import { StatChip } from './stat-chip';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const [m, drilldowns] = await Promise.all([fetchDashboardMetrics(), fetchDashboardDrilldowns()]);

  const today = new Date();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              Overview
            </Badge>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {format(today, 'EEEE, d MMM yyyy')}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Career Ireland — today</h1>
          <p className="text-sm text-muted-foreground">
            Everything needing attention right now, followed by workspace totals.
          </p>
        </div>
      </FadeUp>

      {/* Row 1 — Attention needed. Only the states staff actively work
          through get a tone accent; empty states stay calm to keep the
          dashboard readable when nothing is on fire. */}
      <FadeUp delay={0.05}>
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

      {/* Row 2 — Workspace totals. Compact chip strip for scanning. */}
      <FadeUp delay={0.1}>
        <section aria-label="Workspace totals" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace totals
            </h2>
          </div>
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

      {/* Row 3 — Drilldowns. Keeps the existing rich section for
          people who need to dig in past the top-of-page attention row. */}
      <FadeUp delay={0.15}>
        <section aria-label="Drill down" className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Drill down
            </h2>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <AlertCircle className="size-3" />
              Task inbox
            </Link>
          </div>
          <DashboardDrilldownsSection data={drilldowns} />
        </section>
      </FadeUp>
    </div>
  );
}
