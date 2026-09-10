import { formatDistanceToNow } from 'date-fns';
import { Trophy } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalEmployer } from '@/lib/auth/session';
import { fetchOwnPlacements } from '@/modules/portal/employer-repository';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  PROPOSED: 'secondary',
  CONFIRMED: 'default',
  STARTED: 'default',
  COMPLETED: 'outline',
  TERMINATED_EARLY: 'outline',
} as const;

export default async function EmployerPlacementsPage() {
  const session = await requirePortalEmployer();
  const placements = await fetchOwnPlacements(session.user.employerId);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Placements</h1>
        {placements.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No placements yet"
            description="Candidates Ireland Career Gateway places with your company will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {placements.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{p.candidateName}</CardTitle>
                      <Badge variant={STATUS_VARIANT[p.status]} className="rounded-full">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.requisitionTitle}</p>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
                    <div>
                      <p className="text-muted-foreground">Recorded</p>
                      <p className="mt-1 font-medium">
                        {formatDistanceToNow(p.createdAt, { addSuffix: true })}
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
