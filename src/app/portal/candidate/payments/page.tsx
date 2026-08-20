import { formatDistanceToNow } from 'date-fns';
import { Coins } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalCandidate } from '@/lib/auth/session';
import { fetchOwnPayments } from '@/modules/portal/candidate-repository';

export const dynamic = 'force-dynamic';

export default async function CandidatePaymentsPage() {
  const session = await requirePortalCandidate();
  const payments = await fetchOwnPayments(session.user.personId);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Your payments</h1>
        {payments.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No payments recorded yet"
            description="Payments you make for Career Ireland services will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {payments.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{p.serviceName}</CardTitle>
                    <p className="text-xs text-muted-foreground">{p.method.replace(/_/g, ' ')}</p>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="font-mono text-sm">
                      {p.amount} {p.currency}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="rounded-full">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {p.verifiedAt
                          ? `Verified ${formatDistanceToNow(p.verifiedAt, { addSuffix: true })}`
                          : `Recorded ${formatDistanceToNow(p.createdAt, { addSuffix: true })}`}
                      </span>
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
