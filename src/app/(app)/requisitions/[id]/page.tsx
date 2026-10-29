import {
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  GitBranch,
  MapPin,
  Megaphone,
  Pencil,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { BillingSection } from '@/components/billing/billing-section';
import { FinancialSummaryCard } from '@/components/billing/financial-summary-card';
import { CampaignsPanel } from '@/components/campaigns-panel';
import { EmptyState } from '@/components/empty-state';
import { KpiTile } from '@/components/kpi-tile';
import { FadeUp } from '@/components/motion/motion-primitives';
import { NextActionCard } from '@/components/next-action-card';
import { OwnerAvatar } from '@/components/owner-avatar';
import { ReassignButton } from '@/components/reassign-button';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { checkPermission, requireInternalStaff } from '@/lib/auth/session';
import { statusTone } from '@/lib/ui/status-tone';
import { fetchTasksForRequisition } from '@/modules/activities/service';
import {
  listApplicationsForRequisition,
  listShortlistPromotionCandidates,
} from '@/modules/applications/service';
import { fetchRequisitionBillingHistory } from '@/modules/billing/read';
import { fetchCampaignsForRequisition } from '@/modules/campaigns/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { fetchRequisitionPipeline } from '@/modules/pipeline/service';
import { listPlacementsForRequisition } from '@/modules/placements/service';
import { fetchQualifications } from '@/modules/qualifications/service';
import { computeRequisitionNextAction } from '@/modules/requisitions/next-action';
import { buildSeatModel, REQUISITION_STATUS_LABEL } from '@/modules/requisitions/seats';
import {
  fetchRequisition,
  listRequisitionQualifications,
  listRequisitionSkills,
} from '@/modules/requisitions/service';
import {
  fetchRequisitionActivity,
  listInterviewsAndOffersForRequisition,
} from '@/modules/requisitions/workspace';
import { fetchSkills } from '@/modules/skills/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { listChecklistsForRequisition } from '@/modules/work-permit-checklists/service';
import { RequisitionDialog } from '../requisition-dialog';
import { AddCandidateDialog } from './add-candidate-dialog';
import { AddOutsourcedCandidateDialog } from './add-outsourced-dialog';
import { ChecklistsSection } from './checklists-section';
import { InterviewsOffersSection } from './interviews-offers-section';
import { PipelineWall } from './pipeline-wall';
import { RequisitionQualificationsSection, RequisitionSkillsSection } from './requirements-section';
import { CloseRequisitionButton, RunMatchingButton } from './requisition-actions';
import { RequisitionActivitySection } from './requisition-activity-section';
import { RequisitionTabs } from './requisition-tabs';
import { SeatsSection } from './seats-section';
import { SetRequisitionReminderDialog } from './set-reminder-dialog';
import { WorkLogSection } from './work-log-section';

export const dynamic = 'force-dynamic';

export default async function RequisitionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; edit?: string; close?: string; activityPage?: string }>;
}) {
  const { edit, close, activityPage } = await searchParams;
  const session = await requireInternalStaff();
  const { id } = await params;
  const requisition = await fetchRequisition(id);
  if (!requisition) notFound();

  const [
    pipelineData,
    applications,
    shortlistPromotions,
    requisitionSkillRows,
    requisitionQualRows,
    allSkills,
    allQualifications,
    currencies,
    occupationList,
    checklists,
    staffUsers,
    requisitionBilling,
    requisitionPlacements,
  ] = await Promise.all([
    fetchRequisitionPipeline(id),
    listApplicationsForRequisition(id),
    listShortlistPromotionCandidates(id),
    listRequisitionSkills(id),
    listRequisitionQualifications(id),
    fetchSkills(),
    fetchQualifications(),
    fetchCurrencies(),
    fetchOccupations(),
    listChecklistsForRequisition(id),
    fetchStaffUserOptions(),
    fetchRequisitionBillingHistory(id),
    listPlacementsForRequisition(id),
  ]);
  // Phase 2 blueprint §1.3 — per-requisition work log is backed by
  // the generic tasks table filtered by jobRequisitionId.
  // Phase 2 blueprint §6.1 — ads for this requisition shown inline.
  const activityPageNumber = Math.max(1, Number.parseInt(activityPage ?? '1', 10) || 1);
  const [workLogTasks, requisitionCampaigns, interviewsAndOffers, activity, canManageInterviews] =
    await Promise.all([
      fetchTasksForRequisition(id),
      fetchCampaignsForRequisition(id),
      listInterviewsAndOffersForRequisition(id),
      fetchRequisitionActivity(id, { page: activityPageNumber }),
      // R3 — writes on Interviews & Offers need recruitment.interviews;
      // the server actions check it again.
      checkPermission('recruitment', 'interviews', 'edit'),
    ]);
  const activeCurrencies = currencies.filter((c) => c.isActive).map((c) => c.code);
  // R2 — seats are derived from placements by the R0 capacity rule.
  const seatModel = buildSeatModel(requisition.positionsRequired, requisitionPlacements);
  const isOpen = requisition.status !== 'CLOSED' && requisition.status !== 'CANCELLED';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(
    isOpen && requisition.targetFillDate && requisition.targetFillDate < today,
  );
  const currentOwner = requisition.assignedUserId
    ? (staffUsers.find((u) => u.id === requisition.assignedUserId) ?? null)
    : null;

  const pipelineTotal = Object.values(pipelineData).reduce((sum, arr) => sum + arr.length, 0);

  const nextAction = computeRequisitionNextAction({
    requisitionId: id,
    status: requisition.status,
    positionsRequired: requisition.positionsRequired,
    positionsFilled: requisition.positionsFilled,
    pipelineCounts: {
      source: pipelineData.source.length,
      review: pipelineData.review.length,
      shortlist: pipelineData.shortlist.length,
      apply: pipelineData.apply.length,
      interview: pipelineData.interview.length,
      offer: pipelineData.offer.length,
      placed: pipelineData.placed.length,
    },
  });

  // Pool of candidates the checklist dialog offers = applicants + shortlist,
  // deduped by personId.
  const candidatePoolMap = new Map<string, { personId: string; personName: string }>();
  for (const a of applications) {
    if (a.personId) {
      candidatePoolMap.set(a.personId, {
        personId: a.personId,
        personName: a.personName ?? '(unknown)',
      });
    }
  }
  for (const s of shortlistPromotions) {
    if (!candidatePoolMap.has(s.personId)) {
      candidatePoolMap.set(s.personId, {
        personId: s.personId,
        personName: s.personName,
      });
    }
  }
  const candidatePool = Array.from(candidatePoolMap.values()).sort((a, b) =>
    a.personName.localeCompare(b.personName),
  );

  const fillPct = Math.min(
    100,
    Math.max(
      0,
      seatModel.required > 0 ? Math.round((seatModel.filled / seatModel.required) * 100) : 0,
    ),
  );
  const inPipeline = pipelineTotal - pipelineData.placed.length;
  const atInterviewOrOffer = pipelineData.interview.length + pipelineData.offer.length;
  const interviewsOffersCount =
    interviewsAndOffers.interviews.length + interviewsAndOffers.offers.length;

  const overviewTab = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FadeUp delay={0.03}>
          <RequisitionSkillsSection
            requisitionId={id}
            rows={requisitionSkillRows}
            allSkills={allSkills}
          />
        </FadeUp>
        <FadeUp delay={0.04}>
          <RequisitionQualificationsSection
            requisitionId={id}
            rows={requisitionQualRows}
            allQualifications={allQualifications}
          />
        </FadeUp>
      </div>
      {requisition.description && (
        <FadeUp delay={0.05}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {requisition.description}
              </p>
              {requisition.candidateRequirements && (
                <>
                  <p className="mt-4 text-sm font-medium">Candidate requirements</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {requisition.candidateRequirements}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </FadeUp>
      )}
      {/* Phase 2 blueprint §1.3 — Work Log: operator-facing checklist
          of standard recruitment milestones, backed by the tasks table. */}
      <FadeUp delay={0.052}>
        <WorkLogSection requisitionId={id} tasks={workLogTasks} />
      </FadeUp>
      {/* Phase 2 blueprint §6.1 — ad campaigns tied to this requisition. */}
      <FadeUp delay={0.058}>
        <CampaignsPanel
          campaigns={requisitionCampaigns}
          scope="requisition"
          startAdvertisementHref={`/campaigns?requisitionId=${id}`}
        />
      </FadeUp>
    </div>
  );

  const pipelineTab = (
    <FadeUp>
      <PipelineWall requisition={requisition} data={pipelineData} />
    </FadeUp>
  );

  const seatsTab = (
    <FadeUp>
      <SeatsSection model={seatModel} />
    </FadeUp>
  );

  const interviewsTab = (
    <FadeUp>
      <InterviewsOffersSection
        interviews={interviewsAndOffers.interviews}
        offers={interviewsAndOffers.offers}
        applications={interviewsAndOffers.applications}
        currencies={activeCurrencies}
        canManage={canManageInterviews}
        nowIso={new Date().toISOString()}
      />
    </FadeUp>
  );

  const checklistsTab = (
    <FadeUp>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Work Permit Checklists</CardTitle>
        </CardHeader>
        <CardContent>
          <ChecklistsSection
            requisitionId={id}
            existing={checklists}
            candidatePool={candidatePool}
          />
        </CardContent>
      </Card>
    </FadeUp>
  );

  // Billing for THIS requisition — invoices tied via
  // invoices.job_requisition_id. Per-placement fees live on Seats.
  const billingTab = (
    <FadeUp>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing for this job</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Invoices and receipts linked to this job. Placement fees are listed per seat on the
            Seats &amp; placements tab.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {requisitionBilling.invoices.length === 0 && requisitionBilling.receipts.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No invoices for this job yet"
              description="Invoices raised against this job, including accepted-lead invoices, appear here."
            />
          ) : (
            <>
              {requisitionBilling.invoices.length > 0 && (
                <FinancialSummaryCard invoices={requisitionBilling.invoices} />
              )}
              <BillingSection
                profileHref={`/employers/${requisition.employerId}`}
                invoices={requisitionBilling.invoices}
                receipts={requisitionBilling.receipts}
                canVerify={false}
              />
            </>
          )}
        </CardContent>
      </Card>
    </FadeUp>
  );

  const activityTab = (
    <FadeUp>
      <RequisitionActivitySection
        requisitionId={id}
        rows={activity.rows}
        page={activity.page}
        hasMore={activity.hasMore}
      />
    </FadeUp>
  );

  const statusLabel = REQUISITION_STATUS_LABEL[requisition.status] ?? requisition.status;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/requisitions" className="hover:text-foreground hover:underline">
            Requisitions
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{requisition.title}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/70"
            >
              <Briefcase className="size-7" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl">
                  {requisition.title}
                </h1>
                <Badge variant={statusTone(requisition.status)} className="rounded-full">
                  {statusLabel}
                </Badge>
              </div>
              <Link
                href={`/employers/${requisition.employerId}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                data-testid="requisition-employer-link"
              >
                <Building2 className="size-3.5" aria-hidden />
                {requisition.employerName}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  Owner:
                  <OwnerAvatar
                    user={
                      currentOwner ? { id: currentOwner.id, fullName: currentOwner.fullName } : null
                    }
                    size="sm"
                    showName
                  />
                </span>
                <span className="inline-flex items-center gap-2">
                  <Users className="size-3" aria-hidden />
                  <span className="tabular-nums">
                    {seatModel.filled} of {seatModel.required} placed
                  </span>
                  <span
                    className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={fillPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${fillPct}% of positions filled`}
                  >
                    <span
                      className="absolute inset-y-0 left-0 bg-foreground/70"
                      style={{ width: `${fillPct}%` }}
                    />
                  </span>
                </span>
                <span>{requisition.employmentType.replace(/_/g, ' ').toLowerCase()}</span>
                {requisition.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden />
                    {requisition.location}
                  </span>
                )}
                {requisition.targetFillDate && (
                  <span
                    className={
                      overdue
                        ? 'inline-flex items-center gap-1 font-medium text-destructive'
                        : 'inline-flex items-center gap-1'
                    }
                  >
                    <CalendarClock className="size-3" aria-hidden />
                    Target fill {requisition.targetFillDate}
                    {overdue && ' · overdue'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <RecordHeaderActions
            primary={<AddCandidateDialog requisitionId={id} requisitionTitle={requisition.title} />}
            secondary={[
              <AssignToMeButton
                key="assign"
                entity="requisition"
                id={id}
                currentUserId={session.user.id}
                currentAssignedUserId={requisition.assignedUserId}
                canReassign={session.user.isOwner}
              />,
              <ReassignButton
                key="reassign"
                entity="requisition"
                id={id}
                subjectLabel={`requisition ${requisition.title}`}
                currentAssignedUserId={requisition.assignedUserId}
                currentAssignedName={currentOwner?.fullName ?? null}
                staffUsers={staffUsers.map((u) => ({
                  id: u.id,
                  fullName: u.fullName,
                  email: u.email,
                }))}
                canReassign={session.user.isOwner}
              />,
              <RequisitionDialog
                key="edit"
                initialEmployer={{
                  id: requisition.employerId,
                  legalName: requisition.employerName,
                }}
                occupations={occupationList}
                currencies={currencies}
                initial={requisition}
                defaultOpen={edit === '1'}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="mr-1.5 size-4" /> Edit
                  </Button>
                }
              />,
            ]}
            overflow={[
              <AddOutsourcedCandidateDialog
                key="outsourced"
                requisitionId={id}
                requisitionTitle={requisition.title}
              />,
              <RunMatchingButton key="matching" requisitionId={id} />,
              <Link
                key="advertisement"
                href={`/campaigns?requisitionId=${id}`}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                <Megaphone className="mr-1.5 size-4" aria-hidden /> Start advertisement
              </Link>,
              <SetRequisitionReminderDialog
                key="reminder"
                requisitionId={id}
                requisitionTitle={requisition.title}
                currentUserId={session.user.id}
              />,
              isOpen && <CloseRequisitionButton key="close" requisitionId={id} />,
            ]}
          />
        </div>

        {/* KPI strip — derived from placements by the R0 capacity rule. */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="requisition-kpis">
          <KpiTile
            icon={Users}
            label="Positions"
            value={seatModel.required}
            hint="Required on this job"
            tone="amber"
          />
          <KpiTile
            icon={CheckCircle2}
            label="Confirmed placed"
            value={seatModel.filled}
            hint="Seats held by placements"
            tone="green"
          />
          <KpiTile
            icon={User}
            label="Remaining"
            value={seatModel.remaining}
            hint={
              seatModel.overfilledBy > 0
                ? `Over capacity by ${seatModel.overfilledBy}`
                : 'Seats still to fill'
            }
            tone="rose"
          />
          <KpiTile
            icon={GitBranch}
            label="In pipeline"
            value={inPipeline}
            hint={`${atInterviewOrOffer} at interview or offer`}
            tone="blue"
          />
        </div>
      </FadeUp>

      {/* R2 — ?close=1 opens the close dialog on its own; it no longer
          depends on a next-action card being present. */}
      {close === '1' && isOpen && (
        <CloseRequisitionButton requisitionId={id} defaultOpen hideTrigger />
      )}

      {nextAction && (
        <FadeUp delay={0.02}>
          <NextActionCard
            label={nextAction.label}
            dueHint={nextAction.dueHint}
            sentence={nextAction.sentence}
            tone={nextAction.tone}
            primary={nextAction.primary}
            className="mt-5"
          />
        </FadeUp>
      )}

      <FadeUp delay={0.05} className="mt-6">
        <RequisitionTabs
          panels={{
            pipeline: pipelineTab,
            overview: overviewTab,
            seats: seatsTab,
            interviews: interviewsTab,
            checklists: checklistsTab,
            billing: billingTab,
            activity: activityTab,
          }}
          counts={{
            pipeline: pipelineTotal,
            interviews: interviewsOffersCount,
            checklists: checklists.length,
          }}
        />
      </FadeUp>
    </div>
  );
}
