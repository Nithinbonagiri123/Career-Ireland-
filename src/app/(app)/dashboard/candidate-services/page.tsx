import type { LucideIcon } from 'lucide-react';
import { Coins, LayoutDashboard, UserPlus, Users } from 'lucide-react';
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
          tile.emphasis === 'warn' && Number(tile.value) > 0 && 'border-status-warning/60',
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs">{tile.label}</CardDescription>
            <tile.icon
              className={cn(
                'size-4',
                tile.emphasis === 'warn' && Number(tile.value) > 0
                  ? 'text-status-warning'
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

export default async function CandidateServicesDashboard() {
  await requireRole(['ADMIN', 'STAFF']);
  const m = await fetchDashboardMetrics();

  const tiles: Tile[] = [
    {
      label: 'Total candidates',
      value: m.candidates.total,
      hint: `${m.candidates.available} available · ${m.candidates.placed} placed`,
      href: '/candidates',
      icon: Users,
    },
    {
      label: 'Available now',
      value: m.candidates.available,
      hint: 'Searchable for new requisitions',
      href: '/candidates',
      icon: Users,
    },
    {
      label: 'Placed',
      value: m.candidates.placed,
      hint: `${m.candidates.inactive} inactive / archived`,
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

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={LayoutDashboard}
          badge="Candidate Services"
          title="Candidate services — today"
          description="Focused view of lead intake, candidate pool health, and payment verification."
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
