import { Briefcase, Building2, Trophy } from 'lucide-react';
import Link from 'next/link';
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalEmployer } from '@/lib/auth/session';
import {
  fetchEmployerSelf,
  fetchOwnPlacements,
  fetchOwnRequisitions,
} from '@/modules/portal/employer-repository';

export const dynamic = 'force-dynamic';

export default async function EmployerOverview() {
  const session = await requirePortalEmployer();
  const [self, reqs, placementsList] = await Promise.all([
    fetchEmployerSelf(session.user.employerId),
    fetchOwnRequisitions(session.user.employerId),
    fetchOwnPlacements(session.user.employerId),
  ]);

  const openReqs = reqs.filter((r) =>
    ['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED'].includes(r.status),
  );
  const activePlacements = placementsList.filter((p) =>
    ['CONFIRMED', 'STARTED'].includes(p.status),
  );

  const tiles = [
    {
      icon: Building2,
      label: 'Company',
      value: self?.legalName ?? '—',
      href: '/portal/employer/profile',
    },
    {
      icon: Briefcase,
      label: 'Open requisitions',
      value: openReqs.length,
      href: '/portal/employer/requisitions',
    },
    {
      icon: Trophy,
      label: 'Active placements',
      value: activePlacements.length,
      href: '/portal/employer/placements',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-8">
        <Badge variant="secondary" className="mb-2 rounded-full">
          Employer portal
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">
          {self?.legalName ?? 'Your company'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Requisitions, shortlists, and placements Career Ireland is running for you.
        </p>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <StaggerItem key={t.label}>
            <Link href={t.href} className="block group">
              <Card className="transition-all hover:shadow-md hover:-translate-y-px">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs">{t.label}</CardDescription>
                    <t.icon className="size-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="truncate text-xl font-semibold tracking-tight">
                    {t.value}
                  </CardTitle>
                </CardHeader>
                <CardContent />
              </Card>
            </Link>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
