import { formatDistanceToNow } from 'date-fns';
import { Briefcase, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalEmployer } from '@/lib/auth/session';
import { fetchShortlistForOwnRequisition } from '@/modules/portal/employer-repository';

export const dynamic = 'force-dynamic';

export default async function EmployerRequisitionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePortalEmployer();
  const { id } = await params;
  const data = await fetchShortlistForOwnRequisition(session.user.employerId, id);
  if (!data) notFound(); // 404 = requisition doesn't exist OR belongs to another employer

  const { requisition, shortlist, applications } = data;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Briefcase className="size-4 text-muted-foreground" />
          <Badge variant="secondary" className="rounded-full">
            {requisition.status.replace(/_/g, ' ')}
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{requisition.title}</h1>
        <p className="text-sm text-muted-foreground">
          {requisition.positionsFilled} of {requisition.positionsRequired} positions filled ·{' '}
          {requisition.employmentType.replace(/_/g, ' ')}
          {requisition.location ? ` · ${requisition.location}` : ''}
        </p>
      </FadeUp>

      <FadeUp delay={0.05} className="mb-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Shortlist</CardTitle>
            <Badge variant="secondary" className="rounded-full">
              {shortlist.length}
            </Badge>
          </CardHeader>
          <CardContent>
            {shortlist.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No candidates on the shortlist yet"
                description="Career Ireland will present shortlisted candidates here as they source and screen them."
              />
            ) : (
              <ul className="divide-y">
                {shortlist.map((s) => (
                  <li key={s.shortlistId} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{s.candidateName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.candidateEmail ?? '—'}
                        {s.candidateCity ? ` · ${s.candidateCity}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {s.presentedAt
                        ? `Presented ${formatDistanceToNow(s.presentedAt, { addSuffix: true })}`
                        : 'In review'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Applications</CardTitle>
            <Badge variant="secondary" className="rounded-full">
              {applications.length}
            </Badge>
          </CardHeader>
          <CardContent>
            {applications.length === 0 ? (
              <EmptyState
                title="No applications yet"
                description="Candidates promoted from the shortlist to a formal application will appear here."
              />
            ) : (
              <ul className="divide-y">
                {applications.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{a.candidateName}</p>
                      <p className="text-xs text-muted-foreground">
                        Applied {formatDistanceToNow(a.appliedAt, { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full">
                      {a.status.replace(/_/g, ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
