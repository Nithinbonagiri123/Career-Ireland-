import { format } from 'date-fns';
import {
  BellRing,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  Coins,
  FileBadge,
  Fingerprint,
  PlaneTakeoff,
  Receipt,
  ShieldCheck,
  Trophy,
  User,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { BillingSection } from '@/components/billing/billing-section';
import { FinancialSummaryCard } from '@/components/billing/financial-summary-card';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DsEnumPill } from '@/components/ds/status-pill';
import {
  DetailRows,
  NextActionBanner,
  SectionCard,
  WorkspaceHeader,
} from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { ReassignButton } from '@/components/reassign-button';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { RelatedWorkPanel } from '@/components/related-work-panel';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchTasksForImmigrationCase } from '@/modules/activities/service';
import {
  fetchImmigrationCaseBillingHistory,
  fetchInvoiceableServicesFor,
} from '@/modules/billing/read';
import { fetchDocumentTypes } from '@/modules/document-types/service';
import { fetchPersonDocuments } from '@/modules/documents/service';
import { CASE_STAGE_LABEL, CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import { computeImmigrationNextAction } from '@/modules/immigration/next-action';
import {
  fetchCase,
  listCaseDocumentRequirements,
  listCaseDocuments,
} from '@/modules/immigration/service';
import { fetchPersonDetail } from '@/modules/persons/detail';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { ArchiveCaseButton } from './archive-button';
import { caseBillingHref } from './billing-links';
import { CaseDocumentsSection } from './case-documents-section';
import { CasePhaseHero } from './case-phase-hero';
import { CloseCaseButton, RecordDecisionButtons, SetReminderDialog } from './case-quick-actions';
import { CaseTabs } from './case-tabs';
import { CaseTasksSection } from './tasks-section';

/** Date-only columns (YYYY-MM-DD) → "4 Nov 2026". */
function day(value: string | null) {
  return value ? format(new Date(`${value}T00:00:00Z`), 'd MMM yyyy') : null;
}

const LINK = cn('rounded-sm underline-offset-2 hover:text-foreground hover:underline', FOCUS_RING);

export const dynamic = 'force-dynamic';

export default async function ImmigrationCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireInternalStaff();
  const { id } = await params;
  const c = await fetchCase(id);
  if (!c) notFound();

  const [
    requirements,
    attachedDocs,
    allDocumentTypes,
    beneficiaryDocuments,
    caseTasks,
    staffUsers,
    beneficiaryDetail,
    caseBilling,
    invoiceableServices,
  ] = await Promise.all([
    listCaseDocumentRequirements(id),
    listCaseDocuments(id),
    fetchDocumentTypes(),
    fetchPersonDocuments(c.beneficiaryPersonId),
    fetchTasksForImmigrationCase(id),
    fetchStaffUserOptions(),
    fetchPersonDetail(c.beneficiaryPersonId),
    fetchImmigrationCaseBillingHistory(id),
    // Whichever party pays for immigration work varies by engagement.
    // We load the person-scoped catalog because the beneficiary is
    // always a person; if the employer sponsors, staff can switch
    // payer type inside the invoice dialog. Keeping this narrow avoids
    // showing recruitment-fee services on a permit case.
    fetchInvoiceableServicesFor('PERSON'),
  ]);
  const currentOwner = c.assignedUserId
    ? (staffUsers.find((u) => u.id === c.assignedUserId) ?? null)
    : null;

  const humanType = CASE_TYPE_LABEL[c.caseType];

  const nextAction = computeImmigrationNextAction({
    caseId: id,
    status: c.status,
    reminderOn: c.reminderOn,
    expiresOn: c.expiresOn,
    decisionAt: c.decisionAt,
    submittedAt: c.submittedAt,
    requirements: {
      total: requirements.length,
      missing: requirements.filter((r) => r.status === 'MISSING').length,
    },
  });

  // "Open case" self-links point at this page — no button rather than a
  // link that goes nowhere. Next-action rules return null for CLOSED.
  const selfHref = `/immigration/${id}`;
  const banner = nextAction
    ? {
        ...nextAction,
        primary: nextAction.primary.href === selfHref ? undefined : nextAction.primary,
      }
    : c.status === 'CLOSED'
      ? {
          label: 'Next step',
          dueHint: null,
          sentence: 'This case is closed. No further action is needed.',
          tone: 'muted' as const,
          primary: undefined,
        }
      : null;

  const ownerChip = currentOwner ? (
    <>
      Owner <span className="font-medium text-foreground">{currentOwner.fullName}</span>
    </>
  ) : (
    'Unassigned'
  );

  const detailRows = [
    { label: 'Case type', value: humanType },
    ...(c.authorityReference
      ? [{ label: 'Authority reference', value: c.authorityReference }]
      : []),
    { label: 'Submitted', value: day(c.submittedAt) ?? 'Not recorded' },
    { label: 'Decision', value: day(c.decisionAt) ?? 'Not recorded' },
    ...(c.expiresOn ? [{ label: 'Permit expires', value: day(c.expiresOn) }] : []),
    { label: 'Reminder', value: day(c.reminderOn) ?? 'No reminder set' },
    {
      label: 'Opened',
      value: (
        <time dateTime={c.createdAt.toISOString()} className="tabular-nums">
          {format(c.createdAt, 'd MMM yyyy · HH:mm')}
        </time>
      ),
    },
  ];

  const overviewTab = (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <FadeUp delay={0.05} className="min-w-0 lg:col-span-1">
        <SectionCard icon={FileBadge} title="Case details" testId="case-details">
          <DetailRows rows={detailRows} />
          {c.notes && (
            <div className="mt-4 border-t border-border/60 pt-3">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">
                {c.notes}
              </p>
            </div>
          )}
        </SectionCard>
      </FadeUp>

      <div className="min-w-0 space-y-5 lg:col-span-2">
        <FadeUp delay={0.06}>
          <CasePhaseHero
            beneficiaryName={c.beneficiaryName}
            input={{
              status: c.status,
              submittedAt: c.submittedAt,
              decisionAt: c.decisionAt,
              expiresOn: c.expiresOn,
              reminderOn: c.reminderOn,
              openedAt: c.createdAt,
              requirements: {
                total: requirements.length,
                missingMandatory: requirements.filter(
                  (r) => r.status === 'MISSING' && r.isMandatory === 'MANDATORY',
                ).length,
                totalMandatory: requirements.filter((r) => r.isMandatory === 'MANDATORY').length,
              },
            }}
          />
        </FadeUp>
        <div className="grid gap-5 sm:grid-cols-2">
          <FadeUp delay={0.08} className="min-w-0">
            <SectionCard
              icon={User}
              title="Beneficiary"
              className="h-full"
              action={
                <Link
                  href={`/clients/${c.beneficiaryPersonId}`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  aria-label={`Open candidate profile for ${c.beneficiaryName}`}
                >
                  Open profile
                </Link>
              }
            >
              <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                {c.beneficiaryName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">The person this case is for.</p>
            </SectionCard>
          </FadeUp>
          <FadeUp delay={0.1} className="min-w-0">
            <SectionCard
              icon={Building2}
              title="Sponsor"
              className="h-full"
              action={
                c.sponsorEmployerId ? (
                  <Link
                    href={`/employers/${c.sponsorEmployerId}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    aria-label={`Open employer ${c.sponsorName ?? ''}`.trim()}
                  >
                    Open employer
                  </Link>
                ) : undefined
              }
            >
              {c.sponsorName ? (
                <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                  {c.sponsorName}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No sponsor linked. Cases can also run independently of a placement.
                </p>
              )}
            </SectionCard>
          </FadeUp>
        </div>
        {beneficiaryDetail && (
          <FadeUp delay={0.12}>
            <RelatedWorkPanel
              personId={c.beneficiaryPersonId}
              timeline={beneficiaryDetail.timeline}
            />
          </FadeUp>
        )}
      </div>

      {/* Billing for THIS case — always visible so staff can raise an
          invoice from the case; invoices raised here carry the case link. */}
      <FadeUp delay={0.14} className="min-w-0 lg:col-span-3">
        <SectionCard
          icon={Receipt}
          title="Billing for this case"
          description="Every invoice and receipt linked to this case. Invoices raised here are linked to the case automatically."
          testId="case-billing"
          action={
            <GenerateInvoiceDialog
              payerMode="PERSON"
              payerId={c.beneficiaryPersonId}
              payerLabel={c.beneficiaryName}
              services={invoiceableServices}
              triggerLabel="Raise invoice for this case"
              triggerVariant="outline"
              contextLinks={{ immigrationCaseId: id }}
            />
          }
          bodyClassName="space-y-4"
        >
          {caseBilling.invoices.length > 0 && (
            <FinancialSummaryCard invoices={caseBilling.invoices} />
          )}
          {caseBilling.invoices.length > 0 || caseBilling.receipts.length > 0 ? (
            <BillingSection
              profileHref={`/candidates/${c.beneficiaryPersonId}`}
              invoiceHref={(invoice) => caseBillingHref('invoices', invoice)}
              receiptHref={(receipt) => caseBillingHref('receipts', receipt)}
              invoices={caseBilling.invoices}
              receipts={caseBilling.receipts}
              canVerify={false}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing invoiced against this case yet. Use “Raise invoice for this case” above.
            </p>
          )}
        </SectionCard>
      </FadeUp>
    </div>
  );

  const documentsTab = (
    <FadeUp>
      <CaseDocumentsSection
        caseId={id}
        beneficiaryPersonId={c.beneficiaryPersonId}
        requirements={requirements}
        attachedDocs={attachedDocs}
        documentTypes={allDocumentTypes}
        beneficiaryDocuments={beneficiaryDocuments}
      />
    </FadeUp>
  );

  const tasksTab = (
    <FadeUp>
      <CaseTasksSection caseId={id} rows={caseTasks} />
    </FadeUp>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <WorkspaceHeader
          breadcrumbs={[
            { label: 'Immigration', href: '/immigration' },
            { label: c.beneficiaryName },
          ]}
          avatar={{ icon: PlaneTakeoff, tone: 'blue' }}
          title={c.beneficiaryName}
          status={<DsEnumPill status={c.status} label={CASE_STAGE_LABEL[c.status]} />}
          meta={[
            { key: 'type', icon: FileBadge, content: `${humanType} case` },
            {
              key: 'sponsor',
              icon: Building2,
              content: c.sponsorName ? (
                c.sponsorEmployerId ? (
                  <Link href={`/employers/${c.sponsorEmployerId}`} className={LINK}>
                    {c.sponsorName}
                  </Link>
                ) : (
                  c.sponsorName
                )
              ) : null,
            },
            {
              key: 'ref',
              icon: Fingerprint,
              content: c.authorityReference ? `Ref ${c.authorityReference}` : null,
            },
            {
              key: 'requisition',
              icon: Briefcase,
              content: c.relatedJobRequisitionId ? (
                <Link href={`/requisitions/${c.relatedJobRequisitionId}`} className={LINK}>
                  Requisition
                </Link>
              ) : null,
            },
            {
              key: 'placement',
              icon: Trophy,
              content: c.relatedPlacementId ? (
                <Link href="/placements" className={LINK}>
                  Placement
                </Link>
              ) : null,
            },
            {
              key: 'engagement',
              icon: Coins,
              content: c.serviceEngagementId ? (
                <Link href={`/engagements/${c.serviceEngagementId}`} className={LINK}>
                  Candidate Services engagement
                </Link>
              ) : null,
            },
          ]}
          chips={[
            { key: 'owner', icon: UserRound, content: ownerChip },
            {
              key: 'opened',
              icon: CalendarPlus,
              content: (
                <time dateTime={c.createdAt.toISOString()}>
                  Opened {format(c.createdAt, 'd MMM yyyy · HH:mm')}
                </time>
              ),
            },
            {
              key: 'reminder',
              icon: BellRing,
              content: c.reminderOn ? `Reminder ${day(c.reminderOn)}` : null,
            },
            {
              key: 'expires',
              icon: c.status === 'APPROVED' ? ShieldCheck : CalendarClock,
              content: c.expiresOn ? `Permit expires ${day(c.expiresOn)}` : null,
            },
          ]}
          actions={
            // Primary — none; the Next step banner carries "do this next".
            // Secondary — assign / reassign + the state's next verb.
            // Overflow — archive.
            <RecordHeaderActions
              secondary={[
                <AssignToMeButton
                  key="assign"
                  entity="immigration_case"
                  id={id}
                  currentUserId={session.user.id}
                  currentAssignedUserId={c.assignedUserId}
                  canReassign={session.user.isOwner}
                />,
                <ReassignButton
                  key="reassign"
                  entity="immigration_case"
                  id={id}
                  subjectLabel={`case for ${c.beneficiaryName}`}
                  currentAssignedUserId={c.assignedUserId}
                  currentAssignedName={currentOwner?.fullName ?? null}
                  staffUsers={staffUsers.map((u) => ({
                    id: u.id,
                    fullName: u.fullName,
                    email: u.email,
                  }))}
                  canReassign={session.user.isOwner}
                />,
                c.status !== 'CLOSED' && (
                  <SetReminderDialog key="reminder" caseId={id} currentReminderOn={c.reminderOn} />
                ),
                (c.status === 'SUBMITTED' || c.status === 'UNDER_AUTHORITY_REVIEW') && (
                  <RecordDecisionButtons key="decision" caseId={id} />
                ),
                (c.status === 'APPROVED' || c.status === 'REJECTED') && (
                  <CloseCaseButton key="close" caseId={id} />
                ),
              ]}
              overflow={[
                <ArchiveCaseButton key="archive" caseId={id} beneficiaryName={c.beneficiaryName} />,
              ]}
            />
          }
        />
      </FadeUp>

      {banner && (
        <FadeUp delay={0.02}>
          <NextActionBanner
            label={banner.label}
            dueHint={banner.dueHint}
            sentence={banner.sentence}
            tone={banner.tone}
            primary={banner.primary}
            className="mt-6"
          />
        </FadeUp>
      )}

      <div className="mt-6">
        <CaseTabs
          overview={overviewTab}
          documents={documentsTab}
          tasks={tasksTab}
          counts={{
            documents: attachedDocs.length,
            tasks: caseTasks.length,
          }}
        />
      </div>
    </div>
  );
}
