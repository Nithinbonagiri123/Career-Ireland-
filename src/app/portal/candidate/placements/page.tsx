import { Trophy } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalCandidate } from '@/lib/auth/session';
import { fetchOwnPlacements } from '@/modules/portal/candidate-repository';

export const dynamic = 'force-dynamic';

export default async function CandidatePlacementsPage() {
  const session = await requirePortalCandidate();
  const placements = await fetchOwnPlacements(session.user.personId);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Your placements</h1>
        {placements.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No placements yet"
            description="Once you're placed with an employer, it'll appear here."
          />
        ) : (
          <ul className="space-y-3">
            {placements.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">at {p.employerName}</p>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge variant="default" className="mt-1 rounded-full">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Start</p>
                      <p className="mt-1 font-medium">{p.startDate ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">End</p>
                      <p className="mt-1 font-medium">{p.endDate ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Salary</p>
                      <p className="mt-1 font-mono font-medium">
                        {p.salary ? `${p.salary} ${p.salaryCurrencyCode ?? ''}` : '—'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </FadeUp>
    </div>
  );
}
