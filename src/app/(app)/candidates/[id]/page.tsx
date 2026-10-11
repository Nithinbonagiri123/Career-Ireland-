import { format, formatDistanceToNow } from 'date-fns';
import { eq, or } from 'drizzle-orm';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Briefcase,
  CheckSquare,
  Coins,
  MapPin,
  MessagesSquare,
  PlaneTakeoff,
  Trophy,
  User,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { BillingSection } from '@/components/billing/billing-section';
import { FinancialSummaryCard } from '@/components/billing/financial-summary-card';
import { EditPersonDialog } from '@/components/edit-person-dialog';
import { EmptyState } from '@/components/empty-state';
import { ImmigrationCasesPanel } from '@/components/immigration-cases-panel';
import { FadeUp } from '@/components/motion/motion-primitives';
import { NextActionCard } from '@/components/next-action-card';
import { OwnerAvatar } from '@/components/owner-avatar';
import { PageHeader } from '@/components/page-header';
import { ReassignButton } from '@/components/reassign-button';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { RelatedWorkPanel } from '@/components/related-work-panel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { statusTone } from '@/lib/ui/status-tone';
import { listApplicationsForPerson } from '@/modules/applications/service';
import {
  fetchLatestBillingLinksForPerson,
  fetchPersonBillingHistory,
} from '@/modules/billing/read';
import {
  listCandidateQualifications,
  listCandidateSkills,
  listEmploymentHistory,
} from '@/modules/candidate-details/service';
import { computeCandidateNextAction } from '@/modules/candidates/next-action';
import { fetchDocumentTypes } from '@/modules/document-types/service';
import { listUploadRequestsForPerson } from '@/modules/document-upload-requests/service';
import { fetchPersonDocuments, fetchPersonRequirements } from '@/modules/documents/service';
import { getEmailAccountForCandidate } from '@/modules/email-accounts/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { listCasesForPerson } from '@/modules/immigration/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { fetchPersonDetail, type PersonTimelineItem } from '@/modules/persons/detail';
import { fetchQualifications } from '@/modules/qualifications/service';
import { fetchSkills } from '@/modules/skills/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CaseDialog } from '../../immigration/case-dialog';
import { ApplicationsPanel } from './applications-panel';
import {
  EmploymentHistorySection,
  QualificationsSection,
  SkillsSection,
} from './candidate-details-panel';
import { CandidateTabs } from './candidate-tabs';
import { CvSuggestionsPanel } from './cv-suggestions-panel';
import { DocumentsSection } from './documents-section';
import { EmailAccountPanel } from './email-account-panel';
import { JustCreatedCard } from './just-created-card';
import { RequestDocumentsPanel } from './request-documents-panel';

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
    billingHistory,
    uploadRequests,
    allDocumentTypes,
    staffUsers,
    allOccupations,
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
    fetchPersonBillingHistory(id),
    listUploadRequestsForPerson(id),
    fetchDocumentTypes(),
    fetchStaffUserOptions(),
    fetchOccupations(),
  ]);
  // Immigration cross-business hooks: preload employers + application
  // types + this person's existing cases so we can render the Raise
  // immigration case dialog and the cases panel without a second round
  // trip. Persons list for the CaseDialog picker is scoped to this one
  // candidate — the beneficiary is already known.
  const [immigrationEmployers, immigrationApplicationTypes, immigrationCasesForPerson] =
    await Promise.all([fetchEmployers(), fetchApplicationTypes(), listCasesForPerson(id)]);
  const currentOwner = assignedUserId
    ? (staffUsers.find((u) => u.id === assignedUserId) ?? null)
    : null;

  // Compute the "what to do next" prompt for the top of the record. The
  // state machine is pure (see modules/candidates/next-action.ts) — this
  // block just gathers the two raw inputs it needs (leads + engagements)
  // that fetchPersonDetail doesn't expose directly, and passes through
  // the invoice rows the Billing tab already loaded.
  const [leadRowsForNext, engagementRowsForNext] = await Promise.all([
    db.select({ status: leads.status }).from(leads).where(eq(leads.personId, id)),
    db
      .select({
        id: serviceEngagements.id,
        status: serviceEngagements.status,
        archivedAt: serviceEngagements.archivedAt,
      })
      .from(serviceEngagements)
      .where(
        or(
          eq(serviceEngagements.payerPersonId, id),
          eq(serviceEngagements.beneficiaryPersonId, id),
        ),
      ),
  ]);
  const nextAction = computeCandidateNextAction({
    personId: id,
    candidateProfile: candidateProfile
      ? {
          availabilityStatus: candidateProfile.availabilityStatus,
          lifecycleStatus: candidateProfile.lifecycleStatus,
        }
      : null,
    leads: leadRowsForNext,
    engagements: engagementRowsForNext,
    invoices: billingHistory.invoices.map((r) => ({
      number: r.invoice.number,
      outstandingAmount: r.outstandingAmount,
      totalAmount: r.invoice.totalAmount,
      issuedAt: r.invoice.issuedAt,
    })),
  });

  const fullName = `${person.firstName} ${person.lastName}`;
  const location = [person.currentCity, person.currentCountry].filter(Boolean).join(', ');

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        Owner:{' '}
        <OwnerAvatar
          user={currentOwner ? { id: currentOwner.id, fullName: currentOwner.fullName } : null}
          size="sm"
          showName
        />
      </span>
      {candidateProfile && (
        <>
          {/* Session 9: ONE visible status chip. The chip title attribute
              reveals the lifecycle on hover so the ADMIN info stays
              one gesture away without cluttering the strip. If the
              lifecycle is anything other than ACTIVE (archived or
              inactive) it's noteworthy, so render it as a second
              compact badge instead of hiding it. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5"
            title={`Lifecycle: ${candidateProfile.lifecycleStatus}`}
          >
            <StatusDot tone={statusTone(candidateProfile.availabilityStatus)} />
            {AVAILABILITY_LABEL[candidateProfile.availabilityStatus]}
          </span>
          {candidateProfile.lifecycleStatus !== 'ACTIVE' && (
            <Badge variant={statusTone(candidateProfile.lifecycleStatus)} className="rounded-full">
              {candidateProfile.lifecycleStatus}
            </Badge>
          )}
          {candidateProfile.primaryOccupationName && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
              <Briefcase className="size-3" aria-hidden />
              {candidateProfile.primaryOccupationName}
            </span>
          )}
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
                  <span className="text-muted-foreground">Status</span>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <StatusDot tone={statusTone(candidateProfile.availabilityStatus)} />
                    {AVAILABILITY_LABEL[candidateProfile.availabilityStatus]}
                  </span>
                </div>
                {candidateProfile.lifecycleStatus !== 'ACTIVE' && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Lifecycle</span>
                    <Badge
                      variant={statusTone(candidateProfile.lifecycleStatus)}
                      className="rounded-full text-[10px]"
                    >
                      {candidateProfile.lifecycleStatus}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Primary occupation</span>
                  <span className="text-xs">
                    {candidateProfile.primaryOccupationName ?? (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </span>
                </div>
                {candidateProfile.preferredLocation && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Preferred location</span>
                    <span className="text-xs">{candidateProfile.preferredLocation}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Activated</span>
                  <time
                    dateTime={candidateProfile.activatedAt.toISOString()}
                    className="text-xs tabular-nums"
                  >
                    {formatDistanceToNow(candidateProfile.activatedAt, { addSuffix: true })} ·{' '}
                    {format(candidateProfile.activatedAt, 'dd MMM yyyy · HH:mm')}
                  </time>
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
        <FadeUp delay={0.07}>
          <RelatedWorkPanel personId={id} timeline={timeline} />
        </FadeUp>
        <FadeUp delay={0.075}>
          <ImmigrationCasesPanel cases={immigrationCasesForPerson} />
        </FadeUp>
        <FadeUp delay={0.08}>
          <CvSuggestionsPanel personId={id} />
        </FadeUp>
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
      <ApplicationsPanel
        personId={id}
        rows={candidateApplications}
        knownEmployers={immigrationEmployers.map((e) => ({
          id: e.id,
          legalName: e.legalName,
          tradingName: e.tradingName,
        }))}
      />
    </FadeUp>
  );

  const missingRequirementCount = requirements.filter((r) => r.status === 'MISSING').length;
  const documentsTab = (
    <div className="space-y-6">
      <FadeUp>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ask the candidate to upload</CardTitle>
          </CardHeader>
          <CardContent>
            <RequestDocumentsPanel
              personId={id}
              personEmail={person.email}
              missingRequirementCount={missingRequirementCount}
              requests={uploadRequests}
            />
          </CardContent>
        </Card>
      </FadeUp>
      <FadeUp delay={0.05}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentsSection
              personId={id}
              requirements={requirements}
              documents={documents}
              documentTypes={allDocumentTypes
                .filter((t) => t.isActive && (t.appliesTo === 'PERSON' || t.appliesTo === 'BOTH'))
                .map((t) => ({
                  id: t.id,
                  code: t.code,
                  name: t.name,
                  hasExpiry: t.hasExpiry,
                }))}
            />
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );

  const canVerifyPayments = session.user.role === 'ADMIN' || session.user.role === 'FINANCE';
  const billingTab = (
    <FadeUp>
      {billingHistory.invoices.length > 0 && (
        <div className="mb-4">
          <FinancialSummaryCard invoices={billingHistory.invoices} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing history</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingSection
            profileHref={`/candidates/${id}`}
            invoices={billingHistory.invoices}
            receipts={billingHistory.receipts}
            canVerify={canVerifyPayments}
          />
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
                          className="flex flex-col items-end text-[10px] text-muted-foreground"
                          dateTime={item.at.toISOString()}
                        >
                          <span className="uppercase tracking-wide">
                            {formatDistanceToNow(item.at, { addSuffix: true })}
                          </span>
                          <span className="tabular-nums text-muted-foreground/70">
                            {format(item.at, 'dd MMM yyyy · HH:mm')}
                          </span>
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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
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
            // Phase 2 blueprint §1.2 — primary / secondary / overflow.
            //
            // Primary — the state-aware next action (filled, loudest).
            // Secondary — Edit + ownership (common moves).
            // Overflow — the less-frequent "raise immigration case" trip.
            <RecordHeaderActions
              primary={
                nextAction && (
                  <Link
                    href={nextAction.primary.href}
                    className={buttonVariants({ size: 'sm', variant: 'default' })}
                  >
                    {nextAction.primary.label}
                    <ArrowRight className="ml-1 size-3.5" aria-hidden />
                  </Link>
                )
              }
              secondary={[
                <EditPersonDialog
                  key="edit"
                  person={person}
                  candidateProfile={candidateProfile}
                  occupations={allOccupations.map((o) => ({
                    id: o.id,
                    name: o.name,
                    isActive: o.isActive,
                  }))}
                />,
                candidateProfile && (
                  <AssignToMeButton
                    key="assign"
                    entity="candidate"
                    id={person.id}
                    currentUserId={session.user.id}
                    currentAssignedUserId={assignedUserId}
                    canReassign={session.user.isOwner}
                  />
                ),
                candidateProfile && (
                  <ReassignButton
                    key="reassign"
                    entity="candidate"
                    id={person.id}
                    subjectLabel={fullName}
                    currentAssignedUserId={assignedUserId}
                    currentAssignedName={currentOwner?.fullName ?? null}
                    staffUsers={staffUsers.map((u) => ({
                      id: u.id,
                      fullName: u.fullName,
                      email: u.email,
                    }))}
                    canReassign={session.user.isOwner}
                  />
                ),
              ]}
              overflow={[
                <CaseDialog
                  key="raise-case"
                  trigger={
                    <button
                      type="button"
                      className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    >
                      <PlaneTakeoff className="size-4" /> Raise immigration case
                    </button>
                  }
                  persons={[person]}
                  employers={immigrationEmployers}
                  applicationTypes={immigrationApplicationTypes}
                  prefill={{ beneficiaryPersonId: person.id }}
                />,
              ]}
            />
          }
        />
      </FadeUp>

      {nextAction && (
        <FadeUp delay={0.02}>
          <NextActionCard
            label={nextAction.label}
            dueHint={nextAction.dueHint}
            sentence={nextAction.sentence}
            tone={nextAction.tone}
            primary={nextAction.primary}
            className="-mt-2 mb-6"
          />
        </FadeUp>
      )}

      <CandidateTabs
        overview={overviewTab}
        applications={applicationsTab}
        documents={documentsTab}
        billing={billingTab}
        activity={activityTab}
      />
    </div>
  );
}
