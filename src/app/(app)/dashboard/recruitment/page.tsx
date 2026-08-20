import type { LucideIcon } from 'lucide-react';
import { Briefcase, Building2, LayoutDashboard, ListChecks, Sparkles, Trophy } from 'lucide-react';
import Link from 'next/link';
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';

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

export default async function RecruitmentDashboard() {
  await requireRole(['ADMIN', 'STAFF']);
  const m = await fetchDashboardMetrics();

  const tiles: Tile[] = [
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
      hint: `${m.requisitions.totalPositionsOpen} positions open`,
      href: '/requisitions',
      icon: Briefcase,
    },
    {
      label: 'Filled last 30d',
      value: m.requisitions.filledLast30Days,
      hint: 'Requisitions marked FILLED in the last month',
      href: '/requisitions',
      icon: ListChecks,
    },
    {
      label: 'Active placements',
      value: m.placements.activeConfirmed,
      hint: `${m.placements.createdLast30Days} new last 30d`,
      href: '/placements',
      icon: Trophy,
    },
    {
      label: 'Ads active',
      value: m.ads.active,
      hint: `${m.ads.expired} expired · ${m.ads.expiringWithin30Days} expiring soon`,
      href: '/campaigns',
      icon: Sparkles,
    },
    {
      label: 'Ads expiring (30d)',
      value: m.ads.expiringWithin30Days,
      hint: 'Renewals to plan',
      href: '/campaigns',
      icon: Sparkles,
      emphasis: 'warn',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={LayoutDashboard}
          badge="Recruitment"
          title="Recruitment — today"
          description="Employer engagement, requisition pipeline, placements, and advertising."
        />
      </FadeUp>
      <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <StaggerItem key={t.label}>
            <TileCard tile={t} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
