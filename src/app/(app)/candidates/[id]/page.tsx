import { formatDistanceToNow } from 'date-fns';
import { eq } from 'drizzle-orm';
import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  CheckSquare,
  Coins,
  MapPin,
  MessagesSquare,
  PlaneTakeoff,
  Send,
  Trophy,
  User,
  UserPlus,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { InvitePortalDialog } from '@/components/portal/invite-portal-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { statusTone } from '@/lib/ui/status-tone';
import { listApplicationsForPerson } from '@/modules/applications/service';
import { fetchLatestBillingLinksForPerson } from '@/modules/billing/read';
import {
  listCandidateQualifications,
  listCandidateSkills,
  listEmploymentHistory,
} from '@/modules/candidate-details/service';
import { fetchPersonDocuments, fetchPersonRequirements } from '@/modules/documents/service';
import { getEmailAccountForCandidate } from '@/modules/email-accounts/service';
import { fetchPersonDetail, type PersonTimelineItem } from '@/modules/persons/detail';
import { fetchQualifications } from '@/modules/qualifications/service';
import { fetchSkills } from '@/modules/skills/service';
import { ApplicationsPanel } from './applications-panel';
import {
  EmploymentHistorySection,
  QualificationsSection,
  SkillsSection,
} from './candidate-details-panel';
import { CandidateTabs } from './candidate-tabs';
import { DocumentsSection } from './documents-section';
import { EmailAccountPanel } from './email-account-panel';
import { JustCreatedCard } from './just-created-card';

export const dynamic = 'force-dynamic';

const KIND_ICON: Record<PersonTimelineItem['kind'], LucideIcon> = {
  lead: UserPlus,
  application: Briefcase,
  placement: Trophy,
  engagement: Coins,
  payment: Coins,
  immigration: PlaneTakeoff,
  communication: MessagesSquare,
  task: CheckSquare,
};

const AVAILABILITY_LABEL = {
  AVAILABLE: 'Available',
  TEMPORARILY_UNAVAILABLE: 'Unavailable',
  PLACED: 'Placed',
} as const;

export default async function CandidateDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ just_created?: string }>;
}) {
  const session = await requireInternalStaff();
  const { id } = await params;
  const { just_created } = await searchParams;
  const detail = await fetchPersonDetail(id);
  if (!detail) notFound();
  const billingLinks = just_created === '1' ? await fetchLatestBillingLinksForPerson(id) : null;
  const [assignedRow] = await db
    .select({ assignedUserId: candidateProfiles.assignedUserId })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, id))
    .limit(1);
  const assignedUserId = assignedRow?.assignedUserId ?? null;
  const { person, candidateProfile, timeline } = detail;
  const [
    requirements,
    documents,
    candidateSkillRows,
    candidateQualRows,
    employmentRows,
    emailAccount,
    allSkills,
    allQualifications,
    candidateApplications,
  ] = await Promise.all([
    fetchPersonRequirements(id),
    fetchPersonDocuments(id),
    listCandidateSkills(id),
    listCandidateQualifications(id),
    listEmploymentHistory(id),
    getEmailAccountForCandidate(id),
    fetchSkills(),
    fetchQualifications(),
    listApplicationsForPerson(id),
  ]);

  const fullName = `${person.firstName} ${person.lastName}`;
  const location = [person.currentCity, person.currentCountry].filter(Boolean).join(', ');

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      {candidateProfile && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5">
            <StatusDot tone={statusTone(candidateProfile.availabilityStatus)} />
            {AVAILABILITY_LABEL[candidateProfile.availabilityStatus]}
          </span>
          <Badge variant={statusTone(candidateProfile.lifecycleStatus)} className="rounded-full">
            {candidateProfile.lifecycleStatus}
          </Badge>
        </>
      )}
      {location && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3" aria-hidden />
          {location}
        </span>
      )}
      {person.mergedIntoPersonId && (
        <Badge variant="neutral" className="rounded-full">
          Merged
        </Badge>
      )}
    </div>
  );

  const overviewTab = (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <FadeUp delay={0.05} className="lg:col-span-1 lg:sticky lg:top-4 lg:h-fit">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {candidateProfile ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Availability</span>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <StatusDot tone={statusTone(candidateProfile.availabilityStatus)} />
                    {AVAILABILITY_LABEL[candidateProfile.availabilityStatus]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Lifecycle</span>
                  <Badge
                    variant={statusTone(candidateProfile.lifecycleStatus)}
                    className="rounded-full text-[10px]"
                  >
                    {candidateProfile.lifecycleStatus}
                  </Badge>
                </div>
                {candidateProfile.preferredLocation && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Preferred location</span>
                    <span className="text-xs">{candidateProfile.preferredLocation}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Activated</span>
                  <span className="text-xs">
                    {formatDistanceToNow(candidateProfile.activatedAt, { addSuffix: true })}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not yet activated as a candidate. Convert a Lead to activate.
              </p>
            )}
            <div className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
              <div>
                <span className="uppercase tracking-wide">Nationality</span>{' '}
                <span>{person.nationality ?? '—'}</span>
              </div>
              <div>
                <span className="uppercase tracking-wide">DOB</span>{' '}
                <span>{person.dateOfBirth ?? '—'}</span>
              </div>
              <div>
                <span className="uppercase tracking-wide">Source</span>{' '}
                <span>{person.source ?? 'DIRECT'}</span>
              </div>
            </div>
            {person.notes && (
              <div className="border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{person.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <div className="space-y-6 lg:col-span-2">
        <FadeUp delay={0.1}>
          <SkillsSection personId={id} rows={candidateSkillRows} allSkills={allSkills} />
        </FadeUp>
        <FadeUp delay={0.15}>
          <QualificationsSection
            personId={id}
            rows={candidateQualRows}
            allQualifications={allQualifications}
          />
        </FadeUp>
        <FadeUp delay={0.2}>
          <EmploymentHistorySection personId={id} rows={employmentRows} />
        </FadeUp>
      </div>
    </div>
  );

  const applicationsTab = (
    <FadeUp>
      <ApplicationsPanel personId={id} rows={candidateApplications} />
    </FadeUp>
  );

  const documentsTab = (
    <FadeUp>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsSection personId={id} requirements={requirements} documents={documents} />
        </CardContent>
      </Card>
    </FadeUp>
  );

  const activityTab = (
    <div className="space-y-6">
      <FadeUp>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Activity timeline</CardTitle>
            <Badge variant="secondary" className="rounded-full">
              {timeline.length} entries
            </Badge>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Leads, applications, placements, payments, communications, tasks, and immigration cases will appear here as they happen."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-6">
                {timeline.map((item) => {
                  const Icon = KIND_ICON[item.kind] ?? MessagesSquare;
                  return (
                    <li key={`${item.kind}-${item.id}`} className="relative">
                      <span className="absolute -left-[30px] flex size-6 items-center justify-center rounded-full border bg-background">
                        <Icon className="size-3 text-muted-foreground" />
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                        </div>
                        <time
                          className="whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground"
                          title={item.at.toLocaleString()}
                        >
                          {formatDistanceToNow(item.at, { addSuffix: true })}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </FadeUp>
      <FadeUp delay={0.05}>
        <EmailAccountPanel personId={id} account={emailAccount} />
      </FadeUp>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      {billingLinks && (billingLinks.invoiceNumber || billingLinks.receiptNumber) && (
        <FadeUp>
          <JustCreatedCard
            personId={id}
            invoiceNumber={billingLinks.invoiceNumber}
            receiptNumber={billingLinks.receiptNumber}
          />
        </FadeUp>
      )}
      <FadeUp>
        <PageHeader
          icon={User}
          title={fullName}
          description={person.email ?? person.phone ?? 'No contact recorded'}
          badge={candidateProfile ? 'CANDIDATE' : (person.source ?? 'PERSON')}
          breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: fullName }]}
          meta={metaStrip}
          action={
            <div className="flex items-center gap-2">
              {candidateProfile && (
                <AssignToMeButton
                  entity="candidate"
                  id={person.id}
                  currentUserId={session.user.id}
                  currentAssignedUserId={assignedUserId}
                />
              )}
              <InvitePortalDialog
                target={{ kind: 'CANDIDATE', personId: person.id }}
                defaultEmail={person.email ?? undefined}
                defaultFullName={fullName}
                trigger={
                  <Button size="sm" variant="outline">
                    <Send className="mr-1.5 size-4" /> Invite to portal
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>

      <CandidateTabs
        overview={overviewTab}
        applications={applicationsTab}
        documents={documentsTab}
        activity={activityTab}
      />
    </div>
  );
}
