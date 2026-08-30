import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Clock,
  PlaneTakeoff,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardDrilldowns } from '@/modules/dashboard/drilldowns';

const MODE_LABEL: Record<'PHONE' | 'VIDEO' | 'IN_PERSON' | 'PANEL', string> = {
  PHONE: 'Phone',
  VIDEO: 'Video',
  IN_PERSON: 'In person',
  PANEL: 'Panel',
};

const CASE_TYPE_LABEL: Record<'EMPLOYMENT_PERMIT' | 'VISA' | 'VISA_EXTENSION', string> = {
  EMPLOYMENT_PERMIT: 'Permit',
  VISA: 'Visa',
  VISA_EXTENSION: 'Extension',
};

const PRIORITY_VARIANT: Record<
  'LOW' | 'NORMAL' | 'HIGH' | 'URGENT',
  'default' | 'secondary' | 'outline'
> = {
  LOW: 'outline',
  NORMAL: 'secondary',
  HIGH: 'default',
  URGENT: 'default',
};

function DrilldownCard({
  title,
  icon: Icon,
  count,
  seeAllHref,
  seeAllLabel = 'See all',
  emptyMessage,
  children,
}: {
  title: string;
  icon: typeof Briefcase;
  count: number;
  seeAllHref: string;
  seeAllLabel?: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {title}
          <Badge variant="secondary" className="ml-1 rounded-full text-[10px]">
            {count}
          </Badge>
        </CardTitle>
        <Link
          href={seeAllHref}
          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {seeAllLabel} <ArrowRight className="size-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {count === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardDrilldownsSection({ data }: { data: DashboardDrilldowns }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DrilldownCard
        title="Requisitions unfilled"
        icon={Briefcase}
        count={data.unfilledRequisitions.length}
        seeAllHref="/requisitions"
        emptyMessage="Nothing outstanding. All requisitions are filled or closed."
      >
        {data.unfilledRequisitions.map((r) => (
          <li key={r.id}>
            <Link
              href={`/requisitions/${r.id}`}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-accent/40 -mx-6 px-6"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.employerName} · {r.status.replace(/_/g, ' ').toLowerCase()} · open {r.ageDays}d
                </p>
              </div>
              <span className="shrink-0 rounded-full border bg-card px-2 py-0.5 font-mono text-[10px]">
                {r.positionsFilled}/{r.positionsRequired}
              </span>
            </Link>
          </li>
        ))}
      </DrilldownCard>

      <DrilldownCard
        title="Interviews this week"
        icon={CalendarClock}
        count={data.interviewsThisWeek.length}
        seeAllHref="/interviews"
        emptyMessage="Nothing scheduled in the next 7 days."
      >
        {data.interviewsThisWeek.map((iv) => (
          <li key={iv.id}>
            <Link
              href={`/applications/${iv.applicationId}`}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-accent/40 -mx-6 px-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {format(iv.scheduledAt, 'EEE HH:mm')}
                  </span>
                  <span className="truncate font-medium">{iv.candidateName}</span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {iv.jobLabel} · {MODE_LABEL[iv.mode]}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formatDistanceToNow(iv.scheduledAt, { addSuffix: true })}
              </span>
            </Link>
          </li>
        ))}
      </DrilldownCard>

      <DrilldownCard
        title="Overdue tasks"
        icon={Clock}
        count={data.overdueTasks.length}
        seeAllHref="/tasks"
        emptyMessage="Nothing overdue. Nice."
      >
        {data.overdueTasks.map((t) => (
          <li key={t.id}>
            <Link
              href={t.href}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-accent/40 -mx-6 px-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3 text-destructive" />
                  <span className="truncate font-medium">{t.title}</span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {t.assignedName}
                  {t.dueAt && ` · due ${formatDistanceToNow(t.dueAt, { addSuffix: true })}`}
                </p>
              </div>
              <Badge variant={PRIORITY_VARIANT[t.priority]} className="rounded-full text-[10px]">
                {t.priority}
              </Badge>
            </Link>
          </li>
        ))}
      </DrilldownCard>

      <DrilldownCard
        title="Immigration cases expiring (60d)"
        icon={PlaneTakeoff}
        count={data.expiringImmigrationCases.length}
        seeAllHref="/immigration"
        emptyMessage="No cases expiring in the next 60 days."
      >
        {data.expiringImmigrationCases.map((c) => (
          <li key={c.id}>
            <Link
              href={`/immigration/${c.id}`}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-accent/40 -mx-6 px-6"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {CASE_TYPE_LABEL[c.caseType]} · {c.beneficiaryName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {format(new Date(c.expiresOn), 'PP')}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                  c.daysUntilExpiry <= 14
                    ? 'bg-destructive/10 text-destructive'
                    : c.daysUntilExpiry <= 30
                      ? 'bg-amber-500/10 text-amber-700'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {c.daysUntilExpiry <= 0 ? 'expired' : `${c.daysUntilExpiry}d`}
              </span>
            </Link>
          </li>
        ))}
      </DrilldownCard>
    </div>
  );
}
