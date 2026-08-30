import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckSquare,
  Coins,
  PlaneTakeoff,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchDashboardDrilldowns } from '@/modules/dashboard/drilldowns';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { DashboardDrilldownsSection } from './drilldowns-section';

export const dynamic = 'force-dynamic';

type Tile = {
  label: string;
  value: number | string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  emphasis?: 'default' | 'warn';
};

function TileCard({ tile }: { tile: Tile }) {
  return (
    <Link href={tile.href} className="block group">
      <Card
        className={cn(
          'transition-all hover:shadow-md hover:-translate-y-px',
          tile.emphasis === 'warn' && Number(tile.value) > 0 && 'border-amber-400/60',
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs">{tile.label}</CardDescription>
            <tile.icon
              className={cn(
                'size-4',
                tile.emphasis === 'warn' && Number(tile.value) > 0
                  ? 'text-amber-500'
                  : 'text-muted-foreground',
              )}
            />
          </div>
          <CardTitle className="text-3xl font-semibold tracking-tight">{tile.value}</CardTitle>
        </CardHeader>
        {tile.hint && (
          <CardContent>
            <p className="text-xs text-muted-foreground">{tile.hint}</p>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const [m, drilldowns] = await Promise.all([fetchDashboardMetrics(), fetchDashboardDrilldowns()]);

  const candidateTiles: Tile[] = [
    {
      label: 'Total candidates',
      value: m.candidates.total,
      hint: `${m.candidates.available} available · ${m.candidates.placed} placed`,
      href: '/candidates',
      icon: Users,
    },
    {
      label: 'New leads (7d)',
      value: m.leads.lastSevenDays,
      hint: `${m.leads.total} open · ${m.leads.awaitingPayment} awaiting payment`,
      href: '/leads',
      icon: UserPlus,
    },
    {
      label: 'Payments to verify',
      value: m.payments.awaitingVerification,
      hint: `${m.payments.verifiedLast30Days} verified last 30d`,
      href: '/payments',
      icon: Coins,
      emphasis: 'warn',
    },
  ];

  const recruitmentTiles: Tile[] = [
    {
      label: 'Employers',
      value: m.employers.total,
      hint: `${m.employers.active} active`,
      href: '/employers',
      icon: Building2,
    },
    {
      label: 'Open requisitions',
      value: m.requisitions.open + m.requisitions.inProgress,
      hint: `${m.requisitions.totalPositionsOpen} positions open · ${m.requisitions.filledLast30Days} filled 30d`,
      href: '/requisitions',
      icon: Briefcase,
    },
    {
      label: 'Active placements',
      value: m.placements.activeConfirmed,
      hint: `${m.placements.createdLast30Days} new last 30d`,
      href: '/placements',
      icon: Trophy,
    },
    {
      label: 'Ads expiring (30d)',
      value: m.ads.expiringWithin30Days,
      hint: `${m.ads.active} active · ${m.ads.expired} expired`,
      href: '/campaigns',
      icon: Sparkles,
      emphasis: 'warn',
    },
  ];

  const immigrationTiles: Tile[] = [
    {
      label: 'Open immigration cases',
      value: m.immigration.open,
      hint: `${m.immigration.submitted} submitted`,
      href: '/immigration',
      icon: PlaneTakeoff,
    },
    {
      label: 'Cases expiring (60d)',
      value: m.immigration.expiringWithin60Days,
      hint: 'Renewals to plan',
      href: '/immigration',
      icon: AlertCircle,
      emphasis: 'warn',
    },
  ];

  const activityTiles: Tile[] = [
    {
      label: 'Overdue tasks',
      value: m.tasks.overdue,
      hint: `${m.tasks.dueThisWeek} due this week · ${m.tasks.open} total open`,
      href: '/tasks',
      icon: CheckSquare,
      emphasis: 'warn',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              Overview
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Career Ireland — today</h1>
          <p className="text-sm text-muted-foreground">
            Live metrics across every workspace. Click any tile to drill in.
          </p>
        </div>
      </FadeUp>

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Candidate services
          </h2>
          <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {candidateTiles.map((t) => (
              <StaggerItem key={t.label}>
                <TileCard tile={t} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recruitment
          </h2>
          <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recruitmentTiles.map((t) => (
              <StaggerItem key={t.label}>
                <TileCard tile={t} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Immigration
          </h2>
          <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {immigrationTiles.map((t) => (
              <StaggerItem key={t.label}>
                <TileCard tile={t} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Activities
          </h2>
          <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activityTiles.map((t) => (
              <StaggerItem key={t.label}>
                <TileCard tile={t} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Act on this now
          </h2>
          <FadeUp delay={0.05}>
            <DashboardDrilldownsSection data={drilldowns} />
          </FadeUp>
        </section>
      </div>
    </div>
  );
}
