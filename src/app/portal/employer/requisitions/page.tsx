import { formatDistanceToNow } from 'date-fns';
import { ArrowRight, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalEmployer } from '@/lib/auth/session';
import { fetchOwnRequisitions } from '@/modules/portal/employer-repository';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  DRAFT: 'outline',
  OPEN: 'default',
  IN_PROGRESS: 'default',
  PARTIALLY_FILLED: 'secondary',
  FILLED: 'outline',
  CLOSED: 'outline',
  CANCELLED: 'outline',
} as const;

export default async function EmployerRequisitionsPage() {
  const session = await requirePortalEmployer();
  const requisitions = await fetchOwnRequisitions(session.user.employerId);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Your requisitions</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Career Ireland manages your open requisitions. To add a new one or make changes, contact
          your account manager.
        </p>
        {requisitions.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No requisitions yet"
            description="Your requisitions will appear here once Career Ireland records them."
          />
        ) : (
          <ul className="space-y-3">
            {requisitions.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <Badge variant={STATUS_VARIANT[r.status]} className="rounded-full">
                        {r.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.positionsFilled} of {r.positionsRequired} filled ·{' '}
                      {r.employmentType.replace(/_/g, ' ')}
                      {r.location ? ` · ${r.location}` : ''}
                    </p>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Opened {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                    </span>
                    <Link
                      href={`/portal/employer/requisitions/${r.id}`}
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      View shortlist <ArrowRight className="ml-1.5 size-3.5" />
                    </Link>
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
