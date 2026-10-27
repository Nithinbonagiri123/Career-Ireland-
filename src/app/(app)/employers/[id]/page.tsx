import { asc, desc, eq, inArray } from 'drizzle-orm';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Coins,
  Globe,
  MapPin,
  Pencil,
  PlaneTakeoff,
  Plus,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { BillingSection } from '@/components/billing/billing-section';
import { FinancialSummaryCard } from '@/components/billing/financial-summary-card';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { CampaignsPanel } from '@/components/campaigns-panel';
import { EmptyState } from '@/components/empty-state';
import { ImmigrationCasesPanel } from '@/components/immigration-cases-panel';
import { FadeUp } from '@/components/motion/motion-primitives';
import { NextActionCard } from '@/components/next-action-card';
import { OwnerAvatar } from '@/components/owner-avatar';
import { PageHeader } from '@/components/page-header';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { occupations } from '@/lib/db/schema/occupations';
import { persons } from '@/lib/db/schema/persons';
import { placements } from '@/lib/db/schema/recruitment';
import { statusTone } from '@/lib/ui/status-tone';
import { fetchEmployerBillingHistory, fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCampaignsForEmployer } from '@/modules/campaigns/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { computeEmployerNextAction } from '@/modules/employers/next-action';
import { fetchEmployer, fetchEmployerContacts, fetchEmployers } from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { listCasesForEmployer } from '@/modules/immigration/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchRequisitionsForEmployer } from '@/modules/requisitions/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CaseDialog } from '../../immigration/case-dialog';
import { RequisitionDialog } from '../../requisitions/requisition-dialog';
import { EmployerDialog } from '../employer-dialog';
import { CompleteOnboardingButton } from './complete-onboarding-button';
import { ContactDialog } from './contact-dialog';

export const dynamic = 'force-dynamic';

export default async function EmployerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    raisePlacement?: string;
    raiseRequisition?: string;
    newRequisition?: string;
  }>;
}) {
  const session = await requireInternalStaff();
  const { id } = await params;
  const { raisePlacement, raiseRequisition, newRequisition } = await searchParams;
  const employer = await fetchEmployer(id);
  if (!employer) notFound();

  const [
    contacts,
    requisitions,
    employersAll,
    currencies,
    occupationList,
    invoiceableServices,
    billingHistory,
    allPersons,
    allApplicationTypes,
  ] = await Promise.all([
    fetchEmployerContacts(id),
    fetchRequisitionsForEmployer(id),
    fetchEmployers(),
    fetchCurrencies(),
    db.select().from(occupations).orderBy(asc(occupations.name)),
    // Employer-payable services + packages for the header "Generate
    // invoice" trigger. Includes services with payerType='ANY'.
    fetchInvoiceableServicesFor('EMPLOYER'),
    fetchEmployerBillingHistory(id),
    // Session 5: needed for the "Start immigration case" header button,
    // which opens the shared CaseDialog with sponsor pre-filled.
    fetchPersons(),
    fetchApplicationTypes(),
  ]);
  // Session 11: immigration cases where this employer sponsors someone.
  // Rendered as a dedicated panel so recruitment + immigration status
  // for the same employer are visible in one place.
  const [employerImmigrationCases, employerCampaigns, appSettings, staffUsers] = await Promise.all([
    listCasesForEmployer(id),
    // Session 23 (blueprint §6.1) — ads tied to this employer via the
    // campaigns → requisitions → employer chain.
    fetchCampaignsForEmployer(id),
    // Session 26 (blueprint §8.2) — app-wide VAT-registered flag used
    // to disable the VAT treatment picker in the edit dialog.
    fetchAppSettings(),
    // Session 31 (blueprint §13) — resolve the owner id into a name/
    // avatar for the header. Cheap list fetch — staff is small.
    fetchStaffUserOptions(),
  ]);
  const assignedOwner = employer.assignedUserId
    ? (staffUsers.find((u) => u.id === employer.assignedUserId) ?? null)
    : null;

  // Pull the employer's placements + their latest fee invoice in two
  // small queries. The state machine then decides whether the next step
  // is "raise fee" / "chase overdue" / something earlier in the funnel.
  const employerPlacementRows = await db
    .select({
      id: placements.id,
      jobRequisitionId: placements.jobRequisitionId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(placements)
    .innerJoin(persons, eq(persons.id, placements.personId))
    .where(eq(placements.employerId, id))
    .orderBy(desc(placements.createdAt));
  // Placement fee invoices are keyed on invoice.placement_id. For the
  // state machine's purpose, "outstanding" = 0 when the invoice is PAID
  // or VOIDED, else the full totalAmount. This mirrors how the Placements
  // table surfaces per-row invoice state.
  const placementInvoiceRows =
    employerPlacementRows.length > 0
      ? await db
          .select({
            placementId: invoices.placementId,
            number: invoices.number,
            issuedAt: invoices.issuedAt,
            totalAmount: invoices.totalAmount,
            status: invoices.status,
          })
          .from(invoices)
          .where(
            inArray(
              invoices.placementId,
              employerPlacementRows.map((p) => p.id),
            ),
          )
          .orderBy(desc(invoices.issuedAt))
      : [];
  const latestInvoiceByPlacement = new Map<
    string,
    { number: string; issuedAt: Date; outstandingAmount: string }
  >();
  for (const r of placementInvoiceRows) {
    if (!r.placementId || latestInvoiceByPlacement.has(r.placementId)) continue;
    const settled = r.status === 'PAID' || r.status === 'VOIDED';
    latestInvoiceByPlacement.set(r.placementId, {
      number: r.number,
      issuedAt: r.issuedAt,
      outstandingAmount: settled ? '0.00' : r.totalAmount,
    });
  }
  const nextAction = computeEmployerNextAction({
    employerId: id,
    requisitions: requisitions.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      positionsRequired: r.positionsRequired,
      positionsFilled: r.positionsFilled,
    })),
    placements: employerPlacementRows.map((p) => ({
      id: p.id,
      personName: `${p.firstName} ${p.lastName}`,
      jobRequisitionId: p.jobRequisitionId,
      latestInvoice: latestInvoiceByPlacement.get(p.id) ?? null,
    })),
  });

  // Session 5: surface "Raise placement fee" as a visible top-level
  // button when the employer has a placement that still needs billing.
  // Prefer an uninvoiced placement first; else the oldest unpaid
  // placement so the operator can chase the outstanding one.
  const firstRaisablePlacement =
    employerPlacementRows.find((p) => !latestInvoiceByPlacement.get(p.id)) ??
    employerPlacementRows.find((p) => {
      const inv = latestInvoiceByPlacement.get(p.id);
      return inv && Number.parseFloat(inv.outstandingAmount) > 0;
    }) ??
    null;

  const canVerifyPayments = session.user.role === 'ADMIN' || session.user.role === 'FINANCE';

  const location = [employer.city, employer.country].filter(Boolean).join(', ');

  const totalRequired = requisitions.reduce((sum, r) => sum + r.positionsRequired, 0);
  const totalFilled = requisitions.reduce((sum, r) => sum + r.positionsFilled, 0);
  const openReqs = requisitions.filter((r) => r.status !== 'CLOSED').length;

  // Phase 1 blueprint §4.1 — onboarding completeness signal. Shows when
  // the operator hasn't yet marked onboarding done. "Primary contact"
  // and "billing email" are the two hard requirements; the banner
  // doesn't block the invoice flow but it gets loud about the risk.
  const hasPrimaryContact = contacts.some((c) => c.isPrimary);
  const hasBillingEmail = Boolean(employer.billingEmail);
  const onboardingComplete = Boolean(employer.onboardingCompletedAt);
  const canCompleteOnboarding =
    !onboardingComplete &&
    hasPrimaryContact &&
    (employer.vatTreatment !== 'STANDARD' || hasBillingEmail);

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        Owner:{' '}
        <OwnerAvatar
          user={assignedOwner ? { id: assignedOwner.id, fullName: assignedOwner.fullName } : null}
          size="sm"
          showName
        />
      </span>
      <Badge variant={statusTone(employer.relationshipStatus)} className="rounded-full">
        {employer.relationshipStatus.replace(/_/g, ' ')}
      </Badge>
      {!onboardingComplete && (
        <Badge variant="warning" className="rounded-full">
          Onboarding incomplete
        </Badge>
      )}
      {employer.industry && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
          <Briefcase className="size-3" aria-hidden />
          {employer.industry}
        </span>
      )}
      {location && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3" aria-hidden />
          {location}
        </span>
      )}
      {employer.website && (
        <a
          href={employer.website}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <Globe className="size-3" aria-hidden />
          {employer.website.replace(/^https?:\/\//, '')}
        </a>
      )}
      {requisitions.length > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Briefcase className="size-3" aria-hidden />
          <span className="tabular-nums">
            {openReqs} open · {totalFilled}/{totalRequired} filled
          </span>
        </span>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          title={employer.legalName}
          description={employer.tradingName ? `Trading as ${employer.tradingName}` : undefined}
          breadcrumbs={[{ label: 'Employers', href: '/employers' }, { label: employer.legalName }]}
          meta={metaStrip}
          action={
            // Phase 2 blueprint §1.2 — primary / secondary / overflow.
            //
            // Primary — the most common growth move: "New requisition".
            // Secondary — Assign to me (ownership) + Edit + conditional
            //             "Raise placement fee" when there's one pending.
            // Overflow — Generate invoice + Start immigration case.
            <RecordHeaderActions
              primary={
                <RequisitionDialog
                  employers={employersAll}
                  currencies={currencies}
                  occupations={occupationList}
                  defaultEmployerId={employer.id}
                  defaultOpen={newRequisition === '1'}
                  trigger={
                    <Button size="sm">
                      <Plus className="mr-1.5 size-4" /> New requisition
                    </Button>
                  }
                />
              }
              secondary={[
                <AssignToMeButton
                  key="assign"
                  entity="employer"
                  id={employer.id}
                  currentUserId={session.user.id}
                  currentAssignedUserId={employer.assignedUserId}
                  canReassign={session.user.isOwner}
                />,
                <EmployerDialog
                  key="edit"
                  initial={employer}
                  appVatRegistered={appSettings.vatRegistered}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Pencil className="mr-1.5 size-4" /> Edit
                    </Button>
                  }
                />,
                firstRaisablePlacement && !raisePlacement && (
                  <Link
                    key="raise-fee"
                    href={`/employers/${employer.id}?raisePlacement=${firstRaisablePlacement.id}`}
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                  >
                    <Coins className="mr-1.5 size-4" aria-hidden /> Raise placement fee
                  </Link>
                ),
              ]}
              overflow={[
                <GenerateInvoiceDialog
                  key="generate-invoice"
                  payerMode="EMPLOYER"
                  payerId={employer.id}
                  payerLabel={employer.legalName}
                  services={invoiceableServices}
                  triggerVariant="outline"
                  triggerLabel={raisePlacement ? 'Raise placement fee invoice' : 'Generate invoice'}
                  contextLinks={{
                    placementId: raisePlacement || undefined,
                    jobRequisitionId: raiseRequisition || undefined,
                  }}
                  defaultOpen={Boolean(raisePlacement)}
                />,
                <CaseDialog
                  key="immigration-case"
                  persons={allPersons}
                  employers={employersAll}
                  applicationTypes={allApplicationTypes}
                  prefill={{ sponsorEmployerId: employer.id }}
                  trigger={
                    <button
                      type="button"
                      className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    >
                      <PlaneTakeoff className="size-4" /> Start immigration case
                    </button>
                  }
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

      {/* Phase 1 blueprint §4.1 — onboarding completeness banner. Loud
          but not blocking: the operator can still raise invoices etc,
          but the banner explains what's missing and offers the one
          button that marks the record done. */}
      {!onboardingComplete && (
        <FadeUp delay={0.025}>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                Onboarding incomplete
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-amber-900/90 dark:text-amber-100/90">
                {!hasPrimaryContact && (
                  <li>Add a primary contact under the Contacts section below.</li>
                )}
                {employer.vatTreatment === 'STANDARD' && !hasBillingEmail && (
                  <li>Add an invoice email under Edit → Billing & VAT.</li>
                )}
                {!employer.addressLine1 && (
                  <li>Add a street address (recommended for printable invoices).</li>
                )}
                {hasPrimaryContact && (employer.vatTreatment !== 'STANDARD' || hasBillingEmail) && (
                  <li>Review the record once more, then mark onboarding complete.</li>
                )}
              </ul>
            </div>
            {canCompleteOnboarding && <CompleteOnboardingButton employerId={employer.id} />}
          </div>
        </FadeUp>
      )}

      <FadeUp delay={0.05} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Contacts</CardTitle>
            <ContactDialog
              employerId={employer.id}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 size-4" /> Add contact
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <EmptyState
                icon={User}
                title="No contacts yet"
                description="Add HR / hiring manager contacts for this employer."
              />
            ) : (
              <ul className="divide-y">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {c.fullName}
                        {c.isPrimary && (
                          <Badge variant="default" className="rounded-full text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.jobTitle ?? '—'} · {c.email ?? c.phone ?? 'no contact'}
                      </div>
                    </div>
                    <ContactDialog
                      employerId={employer.id}
                      initial={c}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Edit ${c.fullName}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              Requisitions{' '}
              <span className="ml-1 text-xs text-muted-foreground">({requisitions.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requisitions.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No requisitions yet"
                description="Create a job requisition for this employer with the button above."
              />
            ) : (
              <ul className="divide-y">
                {requisitions.map((r) => {
                  const pct =
                    r.positionsRequired > 0
                      ? Math.min(100, Math.round((r.positionsFilled / r.positionsRequired) * 100))
                      : 0;
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {r.positionsFilled} / {r.positionsRequired} filled
                          </span>{' '}
                          · {r.employmentType.replace(/_/g, ' ')}
                          {r.location ? ` · ${r.location}` : ''}
                        </p>
                        <span
                          className="mt-1.5 block h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${pct}% of positions filled`}
                        >
                          <span
                            className="block h-full bg-foreground/70"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusTone(r.status)} className="rounded-full">
                          {r.status.replace(/_/g, ' ')}
                        </Badge>
                        <RequisitionDialog
                          employers={employersAll}
                          currencies={currencies}
                          occupations={occupationList}
                          initial={r}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`Edit ${r.title}`}>
                              <Pencil className="size-3.5" />
                            </Button>
                          }
                        />
                        <Link
                          href={`/requisitions/${r.id}`}
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Open <ArrowRight className="ml-1.5 size-3.5" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      {/* Session 11: Immigration cases where this employer is the sponsor.
          Sits between Requisitions and Billing — recruitment outcome,
          immigration follow-through, then the money. */}
      <FadeUp delay={0.13} className="mb-8">
        <ImmigrationCasesPanel cases={employerImmigrationCases} />
      </FadeUp>

      {/* Session 23 (blueprint §6.1) — campaigns tied to this client's
          requisitions. Operators can now see at a glance whether a
          client has an advertising campaign running. */}
      <FadeUp delay={0.14} className="mb-8">
        <CampaignsPanel campaigns={employerCampaigns} scope="employer" />
      </FadeUp>

      {billingHistory.invoices.length > 0 && (
        <FadeUp delay={0.13} className="mb-4">
          <FinancialSummaryCard invoices={billingHistory.invoices} />
        </FadeUp>
      )}

      <FadeUp delay={0.15} className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing history</CardTitle>
          </CardHeader>
          <CardContent>
            <BillingSection
              profileHref={`/employers/${id}`}
              invoices={billingHistory.invoices}
              receipts={billingHistory.receipts}
              canVerify={canVerifyPayments}
            />
          </CardContent>
        </Card>
      </FadeUp>

      {employer.notes && (
        <FadeUp delay={0.2}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{employer.notes}</p>
            </CardContent>
          </Card>
        </FadeUp>
      )}
    </div>
  );
}
