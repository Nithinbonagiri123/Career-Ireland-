import { format } from 'date-fns';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarPlus,
  CheckCircle2,
  CircleDashed,
  Clock,
  Coins,
  Contact,
  Factory,
  FileText,
  Globe,
  History,
  Inbox,
  Landmark,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PlaneTakeoff,
  Plus,
  Receipt,
  User,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { BillingSection } from '@/components/billing/billing-section';
import { FinancialSummaryCard } from '@/components/billing/financial-summary-card';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { CampaignsPanel } from '@/components/campaigns-panel';
import { initialsOf } from '@/components/ds/entity-card';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DsEnumPill, DsStatusPill, enumLabel } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import {
  ActivityTimeline,
  DetailRows,
  DS_ROW,
  DS_ROW_LIST,
  NextActionBanner,
  SectionCard,
  WorkspaceHeader,
} from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { ImmigrationCasesPanel } from '@/components/immigration-cases-panel';
import { FadeUp } from '@/components/motion/motion-primitives';
import { RecordHeaderActions } from '@/components/record-header-actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { checkPermission, requireInternalStaff } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { leads } from '@/lib/db/schema/leads';
import { occupations } from '@/lib/db/schema/occupations';
import { persons } from '@/lib/db/schema/persons';
import { placements } from '@/lib/db/schema/recruitment';
import { cn } from '@/lib/utils';
import { fetchEmployerBillingHistory, fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCampaignsForEmployer } from '@/modules/campaigns/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchDocumentsHub } from '@/modules/documents/hub';
import { computeEmployerNextAction } from '@/modules/employers/next-action';
import {
  fetchEmployer,
  fetchEmployerActivity,
  fetchEmployerContacts,
  fetchEmployers,
} from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { listCasesForEmployer } from '@/modules/immigration/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchRequisitionsForEmployer } from '@/modules/requisitions/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CaseDialog } from '../../immigration/case-dialog';
import { EMPLOYMENT_LABEL, JOB_STATUS } from '../../requisitions/job-card';
import { RequisitionDialog } from '../../requisitions/requisition-dialog';
import { EMPLOYER_STATUS } from '../employer-card';
import { EmployerDialog } from '../employer-dialog';
import { CompleteOnboardingButton } from './complete-onboarding-button';
import { ContactDialog } from './contact-dialog';
import { DeleteContactButton } from './delete-contact-button';
import { EmployerWorkspaceTabs } from './employer-workspace-tabs';

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
    tab?: string;
  }>;
}) {
  const session = await requireInternalStaff();
  // R6 — controls follow recruitment.employers / requisitions (actions re-check).
  const [canEditEmployer, canCreateJob, canEditJob] = await Promise.all([
    checkPermission('recruitment', 'employers', 'edit'),
    checkPermission('recruitment', 'requisitions', 'create'),
    checkPermission('recruitment', 'requisitions', 'edit'),
  ]);
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
    fetchInvoiceableServicesFor('EMPLOYER'),
    fetchEmployerBillingHistory(id),
    // Needed for the "Start immigration case" header button (shared
    // CaseDialog with sponsor pre-filled).
    fetchPersons(),
    fetchApplicationTypes(),
  ]);
  const [
    employerImmigrationCases,
    employerCampaigns,
    appSettings,
    staffUsers,
    activity,
    employerDocuments,
    employerLeads,
  ] = await Promise.all([
    listCasesForEmployer(id),
    fetchCampaignsForEmployer(id),
    fetchAppSettings(),
    fetchStaffUserOptions(),
    // R1 — the Activity tab: audit trail touching this employer.
    fetchEmployerActivity(id, { limit: 30 }),
    // R1 — the Documents tab reuses the hub (uploads + invoices + receipts).
    fetchDocumentsHub({ kind: 'ALL', ownerId: id, ownerKind: 'EMPLOYER' }),
    // R1 — the employer's recruitment leads, previously invisible here.
    db
      .select({ id: leads.id, status: leads.status, createdAt: leads.createdAt })
      .from(leads)
      .where(eq(leads.employerId, id))
      .orderBy(desc(leads.createdAt)),
  ]);
  const assignedOwner = employer.assignedUserId
    ? (staffUsers.find((u) => u.id === employer.assignedUserId) ?? null)
    : null;
  const ownerNameById = new Map(staffUsers.map((u) => [u.id, u.fullName]));

  // Placements + their latest fee invoice; feeds the next-action state
  // machine, the header's "Raise placement fee", and the Billing tab's
  // placements card.
  const employerPlacementRows = await db
    .select({
      id: placements.id,
      jobRequisitionId: placements.jobRequisitionId,
      status: placements.status,
      startDate: placements.startDate,
      createdAt: placements.createdAt,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(placements)
    .innerJoin(persons, eq(persons.id, placements.personId))
    .where(eq(placements.employerId, id))
    .orderBy(desc(placements.createdAt));
  const placementInvoiceRows =
    employerPlacementRows.length > 0
      ? await db
          .select({
            placementId: invoices.placementId,
            number: invoices.number,
            issuedAt: invoices.issuedAt,
            totalAmount: invoices.totalAmount,
            currencyCode: invoices.currencyCode,
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
    {
      number: string;
      issuedAt: Date;
      outstandingAmount: string;
      totalAmount: string;
      currencyCode: string;
      status: string;
    }
  >();
  for (const r of placementInvoiceRows) {
    if (!r.placementId || latestInvoiceByPlacement.has(r.placementId)) continue;
    const settled = r.status === 'PAID' || r.status === 'VOIDED';
    latestInvoiceByPlacement.set(r.placementId, {
      number: r.number,
      issuedAt: r.issuedAt,
      outstandingAmount: settled ? '0.00' : r.totalAmount,
      totalAmount: r.totalAmount,
      currencyCode: r.currencyCode,
      status: r.status,
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

  const firstRaisablePlacement =
    employerPlacementRows.find((p) => !latestInvoiceByPlacement.get(p.id)) ??
    employerPlacementRows.find((p) => {
      const inv = latestInvoiceByPlacement.get(p.id);
      return inv && Number.parseFloat(inv.outstandingAmount) > 0;
    }) ??
    null;

  const canVerifyPayments = session.user.role === 'ADMIN' || session.user.role === 'FINANCE';
  const location = [employer.city, employer.country].filter(Boolean).join(', ');

  // KPI strip — active requirements only (CLOSED/CANCELLED excluded) so
  // the headline numbers describe live demand; counters come from the
  // R0-corrected positions_filled.
  const activeReqs = requisitions.filter((r) => r.status !== 'CLOSED' && r.status !== 'CANCELLED');
  const kpiRequired = activeReqs.reduce((sum, r) => sum + r.positionsRequired, 0);
  const kpiFilled = activeReqs.reduce((sum, r) => sum + r.positionsFilled, 0);
  const kpiRemaining = activeReqs.reduce(
    (sum, r) => sum + Math.max(r.positionsRequired - r.positionsFilled, 0),
    0,
  );

  // Onboarding — true blockers (primary contact; billing email when
  // STANDARD VAT) vs recommendation (street address).
  const hasPrimaryContact = contacts.some((c) => c.isPrimary);
  const hasBillingEmail = Boolean(employer.billingEmail);
  const needsBillingEmail = employer.vatTreatment === 'STANDARD' && !hasBillingEmail;
  const onboardingComplete = Boolean(employer.onboardingCompletedAt);
  const canCompleteOnboarding = !onboardingComplete && hasPrimaryContact && !needsBillingEmail;

  const requisitionNextStep = (r: (typeof requisitions)[number]) => {
    if (r.status === 'DRAFT') return { label: 'Open & edit', href: `/requisitions/${r.id}?edit=1` };
    if (r.status === 'CLOSED' || r.status === 'CANCELLED') return null;
    if (r.positionsFilled >= r.positionsRequired)
      return { label: 'Close requisition', href: `/requisitions/${r.id}?close=1` };
    return { label: 'Open pipeline', href: `/requisitions/${r.id}?tab=pipeline` };
  };

  // ── Tab contents ───────────────────────────────────────────────────

  const overviewTab = (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <SectionCard
        icon={Building2}
        title="Employer details"
        action={
          canEditEmployer ? (
            <EmployerDialog
              initial={employer}
              appVatRegistered={appSettings.vatRegistered}
              trigger={
                <Button size="sm" variant="outline">
                  <Pencil className="mr-1.5 size-3.5" /> Edit
                </Button>
              }
            />
          ) : undefined
        }
      >
        <DetailRows
          rows={[
            { label: 'Legal name', value: employer.legalName },
            ...(employer.tradingName ? [{ label: 'Trading as', value: employer.tradingName }] : []),
            ...(employer.industry ? [{ label: 'Industry', value: employer.industry }] : []),
            ...(location ? [{ label: 'Location', value: location }] : []),
            ...(employer.addressLine1
              ? [
                  {
                    label: 'Address',
                    value: [employer.addressLine1, employer.addressLine2, employer.postcode]
                      .filter(Boolean)
                      .join(', '),
                  },
                ]
              : []),
            ...(employer.billingEmail
              ? [{ label: 'Billing email', value: employer.billingEmail, icon: Mail }]
              : []),
            { label: 'Created', value: format(employer.createdAt, 'd MMM yyyy · HH:mm') },
          ]}
        />
        {employer.notes && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{employer.notes}</p>
          </div>
        )}
      </SectionCard>
      <div className="space-y-5">
        <SectionCard icon={Inbox} title="Recruitment leads" count={employerLeads.length}>
          {employerLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads recorded for this employer.</p>
          ) : (
            <ul className="divide-y">
              {employerLeads.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <DsEnumPill status={l.status} />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {format(l.createdAt, 'd MMM yyyy · HH:mm')}
                    </span>
                  </div>
                  <Link
                    href={`/leads/${l.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <ImmigrationCasesPanel cases={employerImmigrationCases} />
        <CampaignsPanel campaigns={employerCampaigns} scope="employer" />
      </div>
    </div>
  );

  const requirementsTab = (
    <SectionCard
      icon={Briefcase}
      title="Job requirements"
      count={requisitions.length}
      action={
        canCreateJob ? (
          <RequisitionDialog
            employers={employersAll}
            currencies={currencies}
            occupations={occupationList}
            defaultEmployerId={employer.id}
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 size-4" /> New requisition
              </Button>
            }
          />
        ) : undefined
      }
    >
      {requisitions.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No job requirements yet"
          description="Create the first requisition so candidates can be sourced for this employer."
        />
      ) : (
        <ul className={DS_ROW_LIST}>
          {requisitions.map((r) => {
            const pct =
              r.positionsRequired > 0
                ? Math.min(100, Math.round((r.positionsFilled / r.positionsRequired) * 100))
                : 0;
            const remaining = Math.max(r.positionsRequired - r.positionsFilled, 0);
            const step = requisitionNextStep(r);
            const owner = r.assignedUserId ? ownerNameById.get(r.assignedUserId) : null;
            const deadline = r.targetFillDate ? new Date(r.targetFillDate) : null;
            const overdue = deadline && deadline.getTime() < Date.now() && r.status !== 'CLOSED';
            return (
              <li key={r.id} className={DS_ROW}>
                <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl',
                      DS_SOFT[JOB_STATUS[r.status].tone],
                    )}
                  >
                    <Briefcase className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/requisitions/${r.id}`}
                        className="truncate text-sm font-semibold text-foreground hover:underline"
                      >
                        {r.title}
                      </Link>
                      <DsStatusPill tone={JOB_STATUS[r.status].tone}>
                        {JOB_STATUS[r.status].label}
                      </DsStatusPill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {r.positionsFilled} of {r.positionsRequired} placed · {remaining} remaining
                      </span>
                      {' · '}
                      {EMPLOYMENT_LABEL[r.employmentType]}
                      {r.location ? ` · ${r.location}` : ''}
                      {owner ? ` · ${owner}` : ''}
                      {deadline && (
                        <span className={cn(overdue && 'font-medium text-destructive')}>
                          {' · due '}
                          {format(deadline, 'd MMM yyyy')}
                        </span>
                      )}
                    </p>
                    <span
                      className="mt-2 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${pct}% of positions filled`}
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {step && (
                    <Link
                      href={step.href}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      {step.label}
                    </Link>
                  )}
                  {canEditJob && (
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
                  )}
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
    </SectionCard>
  );

  const contactsTab = (
    <SectionCard
      icon={Contact}
      title="Contacts"
      count={contacts.length}
      action={
        canEditEmployer ? (
          <ContactDialog
            employerId={employer.id}
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 size-4" /> Add contact
              </Button>
            }
          />
        ) : undefined
      }
    >
      {contacts.length === 0 ? (
        <EmptyState
          icon={User}
          title="No contacts yet"
          description="Add HR / hiring manager contacts for this employer."
        />
      ) : (
        <ul className={DS_ROW_LIST}>
          {contacts.map((c) => (
            <li key={c.id} className={DS_ROW}>
              <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-full text-xs font-semibold',
                    DS_SOFT[c.isPrimary ? 'blue' : 'slate'],
                  )}
                >
                  {initialsOf(c.fullName)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {c.fullName}
                    {c.isPrimary && <DsStatusPill tone="blue">Primary</DsStatusPill>}
                  </div>
                  {c.jobTitle && <p className="text-xs text-muted-foreground">{c.jobTitle}</p>}
                  {(c.email || c.phone) && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground/80">
                      {c.email && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Mail className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                          <span className="truncate">{c.email}</span>
                        </span>
                      )}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                          {c.phone}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              {canEditEmployer && (
                <div className="flex items-center gap-1">
                  <ContactDialog
                    employerId={employer.id}
                    initial={c}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Edit ${c.fullName}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                    }
                  />
                  <DeleteContactButton
                    contactId={c.id}
                    employerId={employer.id}
                    contactName={c.fullName}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  const billingTab = (
    <div className="space-y-5">
      <SectionCard
        icon={Landmark}
        title="Billing & VAT settings"
        description="Change these under Edit → Billing & VAT. Invoices copy the treatment and terms at issue time, so historical invoices keep the terms they were issued under."
        action={
          canEditEmployer ? (
            <EmployerDialog
              initial={employer}
              appVatRegistered={appSettings.vatRegistered}
              trigger={
                <Button size="sm" variant="outline">
                  <Pencil className="mr-1.5 size-3.5" /> Edit
                </Button>
              }
            />
          ) : undefined
        }
      >
        <DetailRows
          rows={[
            { label: 'VAT treatment', value: enumLabel(employer.vatTreatment) },
            {
              label: 'VAT ID',
              value: employer.vatId ?? <span className="text-muted-foreground">Not recorded</span>,
            },
            {
              label: 'Payment terms',
              value:
                employer.paymentTermsDays != null
                  ? `${employer.paymentTermsDays} days`
                  : `App default (${appSettings.defaultPaymentTermsDays} days)`,
            },
            {
              label: 'Invoice email',
              value: employer.billingEmail ?? (
                <span className="text-muted-foreground">Not recorded</span>
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard icon={Coins} title="Placements" count={employerPlacementRows.length}>
        {employerPlacementRows.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No placements yet"
            description="Confirmed placements and their fee invoices appear here."
          />
        ) : (
          <ul className={DS_ROW_LIST}>
            {employerPlacementRows.map((p) => {
              const inv = latestInvoiceByPlacement.get(p.id);
              const reqTitle =
                requisitions.find((r) => r.id === p.jobRequisitionId)?.title ?? 'Requisition';
              const name = `${p.firstName} ${p.lastName}`;
              return (
                <li key={p.id} className={DS_ROW}>
                  <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        DS_SOFT.blue,
                      )}
                    >
                      {initialsOf(name)}
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">{name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {reqTitle}
                        {p.startDate
                          ? ` · starts ${format(new Date(p.startDate), 'd MMM yyyy')}`
                          : ''}{' '}
                        · recorded {format(p.createdAt, 'd MMM yyyy · HH:mm')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DsEnumPill status={p.status} />
                    {inv ? (
                      <Link
                        href={`/employers/${employer.id}/invoices/${inv.number}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                      >
                        <FileText className="size-3.5" aria-hidden />
                        <span className="font-mono">{inv.number}</span> ·{' '}
                        {Number.parseFloat(inv.outstandingAmount) > 0
                          ? `${formatCurrency(inv.outstandingAmount, inv.currencyCode)} due`
                          : 'settled'}
                      </Link>
                    ) : p.status === 'CONFIRMED' ||
                      p.status === 'STARTED' ||
                      p.status === 'COMPLETED' ? (
                      <Link
                        href={`/employers/${employer.id}?raisePlacement=${p.id}&raiseRequisition=${p.jobRequisitionId}`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        <Coins className="mr-1.5 size-3.5" aria-hidden /> Raise fee
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not billable yet</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {billingHistory.invoices.length > 0 && (
        <FinancialSummaryCard invoices={billingHistory.invoices} />
      )}
      <SectionCard icon={Receipt} title="Billing history">
        <BillingSection
          profileHref={`/employers/${id}`}
          invoices={billingHistory.invoices}
          receipts={billingHistory.receipts}
          canVerify={canVerifyPayments}
        />
      </SectionCard>
    </div>
  );

  const documentsTab = (
    <SectionCard
      icon={FileText}
      title="Documents"
      count={employerDocuments.length}
      action={
        <Link
          href={`/documents?client=${employer.id}&type=EMPLOYER`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Open folder <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      }
    >
      {employerDocuments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Uploads, invoices and receipts for this employer collect here."
        />
      ) : (
        <ul className={DS_ROW_LIST}>
          {employerDocuments.slice(0, 15).map((d) => (
            <li key={`${d.kind}-${d.id}`} className={DS_ROW}>
              <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                <span
                  aria-hidden
                  className={cn('grid size-9 shrink-0 place-items-center rounded-xl', DS_SOFT.blue)}
                >
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">{d.reference}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.typeLabel} · {format(d.createdAt, 'd MMM yyyy · HH:mm')}
                  </p>
                </div>
              </div>
              {d.amount && (
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(d.amount, d.currencyCode ?? 'EUR')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  const activityTab = (
    <SectionCard
      icon={History}
      title="Activity"
      description="Every recorded change to this employer, newest first."
    >
      {activity.length === 0 ? (
        <EmptyState
          icon={History}
          title="No recorded activity yet"
          description="Changes to this employer will be listed here with who made them and when."
        />
      ) : (
        <ActivityTimeline
          items={activity.map((a) => ({
            id: a.id,
            title: a.summary.charAt(0).toUpperCase() + a.summary.slice(1),
            subtitle: a.actorName ?? 'System',
            at: a.occurredAt,
          }))}
        />
      )}
    </SectionCard>
  );

  // ── Page ───────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <WorkspaceHeader
          breadcrumbs={[{ label: 'Employers', href: '/employers' }, { label: employer.legalName }]}
          avatar={{
            initials: initialsOf(employer.tradingName ?? employer.legalName),
            tone: EMPLOYER_STATUS[employer.relationshipStatus].tone,
          }}
          title={employer.legalName}
          status={
            <DsStatusPill tone={EMPLOYER_STATUS[employer.relationshipStatus].tone}>
              {EMPLOYER_STATUS[employer.relationshipStatus].label}
            </DsStatusPill>
          }
          subtitle={employer.tradingName ? `Trading as ${employer.tradingName}` : undefined}
          meta={[
            { key: 'industry', icon: Factory, content: employer.industry || null },
            { key: 'location', icon: MapPin, content: location || null },
            {
              key: 'email',
              icon: Mail,
              content: employer.billingEmail || null,
            },
            {
              key: 'website',
              icon: Globe,
              content: employer.website ? (
                <a
                  href={employer.website}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:text-foreground hover:underline"
                >
                  {employer.website.replace(/^https?:\/\//, '')}
                </a>
              ) : null,
            },
          ]}
          chips={[
            {
              key: 'owner',
              icon: UserRound,
              content: assignedOwner ? (
                <>
                  Owner{' '}
                  <span className="font-medium text-foreground">{assignedOwner.fullName}</span>
                </>
              ) : (
                'Unassigned'
              ),
            },
            {
              key: 'onboarding',
              icon: onboardingComplete ? BadgeCheck : CircleDashed,
              content: onboardingComplete ? 'Onboarding complete' : 'Onboarding in progress',
            },
            {
              key: 'terms',
              icon: Clock,
              content: employer.paymentTermsDays
                ? `Payment terms ${employer.paymentTermsDays} days`
                : null,
            },
            {
              key: 'since',
              icon: CalendarPlus,
              content: `Added ${format(employer.createdAt, 'd MMM yyyy · HH:mm')}`,
            },
          ]}
          actions={
            <RecordHeaderActions
              primary={
                canCreateJob ? (
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
                ) : undefined
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
                canEditEmployer && (
                  <EmployerDialog
                    key="edit"
                    initial={employer}
                    appVatRegistered={appSettings.vatRegistered}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil className="mr-1.5 size-4" /> Edit
                      </Button>
                    }
                  />
                ),
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

        {/* KPI strip — live demand only, from R0-corrected counters. */}
        <StatTileGrid className="mt-6">
          <StatTile
            testId="kpi-Active requirements"
            icon={Briefcase}
            label="Active requirements"
            value={activeReqs.length}
            hint="Jobs currently open"
            tone="blue"
          />
          <StatTile
            testId="kpi-Positions required"
            icon={Users}
            label="Positions required"
            value={kpiRequired}
            hint="Across active jobs"
            tone="amber"
          />
          <StatTile
            testId="kpi-Confirmed placed"
            icon={CheckCircle2}
            label="Confirmed placed"
            value={kpiFilled}
            hint="Seats filled by placements"
            tone="green"
          />
          <StatTile
            testId="kpi-Remaining"
            icon={User}
            label="Remaining"
            value={kpiRemaining}
            hint="Seats still to fill"
            tone="rose"
          />
        </StatTileGrid>
      </FadeUp>

      {nextAction && (
        <FadeUp delay={0.02}>
          <NextActionBanner
            label={nextAction.label}
            dueHint={nextAction.dueHint}
            sentence={nextAction.sentence}
            tone={nextAction.tone}
            primary={nextAction.primary}
            className="mt-4"
          />
        </FadeUp>
      )}

      {/* R1 — compact onboarding strip: one line, blockers vs
          recommendation clearly separated, each item a direct pointer. */}
      {!onboardingComplete && (
        <FadeUp delay={0.025}>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-amber-900 dark:text-amber-100">
              <span className="font-semibold">Onboarding incomplete:</span>
              {!hasPrimaryContact && (
                <Link
                  href="?tab=contacts"
                  className="rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-medium hover:bg-amber-200/80 dark:border-amber-800 dark:bg-amber-900/50"
                >
                  Primary contact required
                </Link>
              )}
              {needsBillingEmail && (
                <span className="rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-medium dark:border-amber-800 dark:bg-amber-900/50">
                  Invoice email required (Edit → Billing &amp; VAT)
                </span>
              )}
              {!employer.addressLine1 && (
                <span className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 dark:border-amber-800">
                  Street address recommended
                </span>
              )}
              {canCompleteOnboarding && <span>All requirements met — mark it done.</span>}
            </div>
            {canCompleteOnboarding && canEditEmployer && (
              <CompleteOnboardingButton employerId={employer.id} />
            )}
          </div>
        </FadeUp>
      )}

      <FadeUp delay={0.05} className="mt-5">
        <EmployerWorkspaceTabs
          overview={overviewTab}
          requirements={requirementsTab}
          contacts={contactsTab}
          billing={billingTab}
          documents={documentsTab}
          activity={activityTab}
        />
      </FadeUp>
    </div>
  );
}
