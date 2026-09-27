import { CalendarClock, ExternalLink, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Timestamp } from '@/components/timestamp';
import { Card, CardContent } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { listInterviewStageApplications } from '@/modules/interviews/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Interviews' };

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string }>;
}) {
  await requirePermission('recruitment', 'interviews', 'view');
  const { assigned } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const rows = await listInterviewStageApplications({ scope });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CalendarClock}
          iconTone="purple"
          title="Interviews"
          description="Every candidate currently on the Interview stage of any requisition. The employer runs the interview itself — this page just tells you who's in that stage right now."
          action={<ScopeFilter current={scope} />}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <EmptyState
                icon={CalendarClock}
                title="Nobody at the Interview stage right now"
                description="When a candidate is moved into the Interview lane on a requisition's pipeline, they'll show up here."
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {rows.map((r) => (
                  <li
                    key={r.applicationId}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
                      <User className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/candidates/${r.candidatePersonId}`}
                        className="block truncate text-sm font-medium text-foreground hover:underline"
                      >
                        {r.candidateName}
                      </Link>
                      {r.candidateEmail && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <Mail className="size-3 shrink-0" />
                          {r.candidateEmail}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {r.isExternal ? (
                        <p className="flex items-center gap-1 truncate text-sm text-foreground">
                          <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                          {r.externalJobTitle ?? r.externalCompanyName ?? 'External application'}
                        </p>
                      ) : r.requisitionId && r.requisitionTitle ? (
                        <Link
                          href={`/requisitions/${r.requisitionId}`}
                          className="block truncate text-sm text-foreground hover:underline"
                        >
                          {r.requisitionTitle}
                        </Link>
                      ) : (
                        <p className="truncate text-sm text-muted-foreground">Requisition</p>
                      )}
                      {r.employerName && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {r.employerName}
                        </p>
                      )}
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Moved to Interview
                      </p>
                      <Timestamp date={r.promotedAt} absoluteOnly />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </FadeUp>
    </div>
  );
}
