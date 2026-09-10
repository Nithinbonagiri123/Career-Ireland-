import { Briefcase, Coins, Trophy, User } from 'lucide-react';
import Link from 'next/link';
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalCandidate } from '@/lib/auth/session';
import {
  fetchCandidateSelf,
  fetchOwnApplications,
  fetchOwnPayments,
  fetchOwnPlacements,
} from '@/modules/portal/candidate-repository';

export const dynamic = 'force-dynamic';

export default async function CandidateOverview() {
  const session = await requirePortalCandidate();
  const [self, apps, placementsList, paymentsList] = await Promise.all([
    fetchCandidateSelf(session.user.personId),
    fetchOwnApplications(session.user.personId),
    fetchOwnPlacements(session.user.personId),
    fetchOwnPayments(session.user.personId),
  ]);

  const availabilityLabel = self?.profile?.availabilityStatus ?? 'Not yet activated';
  const openApps = apps.filter((a) => !['ACCEPTED', 'REJECTED', 'WITHDRAWN'].includes(a.status));
  const activePlacements = placementsList.filter((p) =>
    ['CONFIRMED', 'STARTED'].includes(p.status),
  );
  const pendingPayments = paymentsList.filter((p) => p.status !== 'VERIFIED');

  const tiles = [
    {
      icon: User,
      label: 'Availability',
      value: availabilityLabel,
      href: '/portal/candidate/profile',
    },
    {
      icon: Briefcase,
      label: 'Open applications',
      value: openApps.length,
      href: '/portal/candidate/applications',
    },
    {
      icon: Trophy,
      label: 'Active placements',
      value: activePlacements.length,
      href: '/portal/candidate/placements',
    },
    {
      icon: Coins,
      label: 'Payments pending',
      value: pendingPayments.length,
      href: '/portal/candidate/payments',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-8">
        <Badge variant="secondary" className="mb-2 rounded-full">
          Candidate portal
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi {session.user.name.split(' ')[0]},
        </h1>
        <p className="text-sm text-muted-foreground">
          Your applications, placements, and payments — always up to date. Edits happen in the
          Ireland Career Gateway office; changes appear here automatically.
        </p>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <StaggerItem key={t.label}>
            <Link href={t.href} className="block group">
              <Card className="transition-all hover:shadow-md hover:-translate-y-px">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs">{t.label}</CardDescription>
                    <t.icon className="size-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-xl font-semibold tracking-tight">{t.value}</CardTitle>
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
