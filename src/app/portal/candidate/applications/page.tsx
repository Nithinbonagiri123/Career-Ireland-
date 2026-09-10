import { formatDistanceToNow } from 'date-fns';
import { Briefcase } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalCandidate } from '@/lib/auth/session';
import { fetchOwnApplications } from '@/modules/portal/candidate-repository';

export const dynamic = 'force-dynamic';

export default async function CandidateApplicationsPage() {
  const session = await requirePortalCandidate();
  const applications = await fetchOwnApplications(session.user.personId);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Your applications</h1>
        {applications.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No applications yet"
            description="When Ireland Career Gateway submits you for a role, it'll appear here with the current status."
          />
        ) : (
          <ul className="space-y-3">
            {applications.map((a) => (
              <li key={a.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {a.employerName}
                      {a.location ? ` · ${a.location}` : ''} · {a.employmentType.replace(/_/g, ' ')}
                    </p>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <Badge variant="secondary" className="rounded-full">
                      {a.status.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Applied {formatDistanceToNow(a.appliedAt, { addSuffix: true })}
                    </span>
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
