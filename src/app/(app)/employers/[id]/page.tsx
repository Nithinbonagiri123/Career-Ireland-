import { format } from 'date-fns';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Coins,
  FileText,
  Globe,
  MapPin,
  Pencil,
  PlaneTakeoff,
  Plus,
  User,
  Users,
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
import { RecordHeaderActions } from '@/components/record-header-actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireInternalStaff } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { leads } from '@/lib/db/schema/leads';
import { occupations } from '@/lib/db/schema/occupations';
import { persons } from '@/lib/db/schema/persons';
import { placements } from '@/lib/db/schema/recruitment';
import { statusTone } from '@/lib/ui/status-tone';
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
import { RequisitionDialog } from '../../requisitions/requisition-dialog';
import { EmployerDialog } from '../employer-dialog';
import { CompleteOnboardingButton } from './complete-onboarding-button';
import { ContactDialog } from './contact-dialog';
import { DeleteContactButton } from './delete-contact-button';
import { EmployerWorkspaceTabs } from './employer-workspace-tabs';

export const dynamic = 'force-dynamic';

const KPI_TONES = {
  blue: 'bg-sky-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-500 text-white',
  rose: 'bg-rose-500 text-white',
} as const;

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof KPI_TONES;
}) {
  return (
    <div
      data-testid={`kpi-${label}`}
      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm ring-1 ring-border/60"
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', KPI_TONES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

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
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Employer details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">Legal name</dt>
            <dd>{employer.legalName}</dd>
            {employer.tradingName && (
              <>
                <dt className="text-muted-foreground">Trading as</dt>
                <dd>{employer.tradingName}</dd>
              </>
            )}
            {employer.industry && (
              <>
                <dt className="text-muted-foreground">Industry</dt>
                <dd>{employer.industry}</dd>
              </>
            )}
            {location && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{location}</dd>
              </>
            )}
            {employer.addressLine1 && (
              <>
                <dt className="text-muted-foreground">Address</dt>
                <dd>
                  {[employer.addressLine1, employer.addressLine2, employer.postcode]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd>{format(employer.createdAt, 'd MMM yyyy · HH:mm')}</dd>
          </dl>
          {employer.notes && (
            <div className="mt-4 border-t pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {employer.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recruitment leads{' '}
              <span className="ml-1 text-xs text-muted-foreground">({employerLeads.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {employerLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads recorded for this employer.</p>
            ) : (
              <ul className="divide-y">
                {employerLeads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 text-sm">
                      <Badge variant={statusTone(l.status)} className="rounded-full">
                        {l.status.replace(/_/g, ' ')}
                      </Badge>
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
          </CardContent>
        </Card>
        <ImmigrationCasesPanel cases={employerImmigrationCases} />
        <CampaignsPanel campaigns={employerCampaigns} scope="employer" />
      </div>
    </div>
  );

  const requirementsTab = (
    <div className="mt-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Job requirements{' '}
            <span className="ml-1 text-xs text-muted-foreground">({requisitions.length})</span>
          </CardTitle>
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
        </CardHeader>
        <CardContent>
          {requisitions.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No job requirements yet"
              description="Create the first requisition so candidates can be sourced for this employer."
            />
          ) : (
            <ul className="divide-y">
              {requisitions.map((r) => {
                const pct =
                  r.positionsRequired > 0
                    ? Math.min(100, Math.round((r.positionsFilled / r.positionsRequired) * 100))
                    : 0;
                const remaining = Math.max(r.positionsRequired - r.positionsFilled, 0);
                const step = requisitionNextStep(r);
                const owner = r.assignedUserId ? ownerNameById.get(r.assignedUserId) : null;
                const deadline = r.targetFillDate ? new Date(r.targetFillDate) : null;
                const overdue =
                  deadline && deadline.getTime() < Date.now() && r.status !== 'CLOSED';
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <Badge variant={statusTone(r.status)} className="rounded-full">
                          {r.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {r.positionsFilled} of {r.positionsRequired} placed · {remaining}{' '}
                          remaining
                        </span>
                        {' · '}
                        {r.employmentType.replace(/_/g, ' ')}
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
                      {step && (
                        <Link
                          href={step.href}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          {step.label}
                        </Link>
                      )}
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
    </div>
  );

  const contactsTab = (
    <div className="mt-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const billingTab = (
    <div className="mt-5 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing &amp; VAT settings</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">VAT treatment</dt>
            <dd>{employer.vatTreatment.replace(/_/g, ' ')}</dd>
            <dt className="text-muted-foreground">VAT ID</dt>
            <dd>{employer.vatId ?? '—'}</dd>
            <dt className="text-muted-foreground">Payment terms</dt>
            <dd>
              {employer.paymentTermsDays != null
                ? `${employer.paymentTermsDays} days`
                : `App default (${appSettings.defaultPaymentTermsDays} days)`}
            </dd>
            <dt className="text-muted-foreground">Invoice email</dt>
            <dd>{employer.billingEmail ?? '—'}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Change these under Edit → Billing &amp; VAT. Invoices copy the treatment and terms at
            issue time, so historical invoices keep the terms they were issued under.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Placements{' '}
            <span className="ml-1 text-xs text-muted-foreground">
              ({employerPlacementRows.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employerPlacementRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No placements yet. Confirmed placements and their fee invoices appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {employerPlacementRows.map((p) => {
                const inv = latestInvoiceByPlacement.get(p.id);
                const reqTitle =
                  requisitions.find((r) => r.id === p.jobRequisitionId)?.title ?? 'Requisition';
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {reqTitle} ·{' '}
                        {p.startDate
                          ? `starts ${format(new Date(p.startDate), 'd MMM yyyy')}`
                          : 'no start date'}{' '}
                        · recorded {format(p.createdAt, 'd MMM yyyy · HH:mm')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusTone(p.status)} className="rounded-full">
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                      {inv ? (
                        <Link
                          href={`/employers/${employer.id}/invoices/${inv.number}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {inv.number} ·{' '}
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
                        <span className="text-xs text-muted-foreground">not billable yet</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {billingHistory.invoices.length > 0 && (
        <FinancialSummaryCard invoices={billingHistory.invoices} />
      )}
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
    </div>
  );

  const documentsTab = (
    <div className="mt-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Documents{' '}
            <span className="ml-1 text-xs text-muted-foreground">({employerDocuments.length})</span>
          </CardTitle>
          <Link
            href={`/documents?client=${employer.id}&type=EMPLOYER`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Open folder <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {employerDocuments.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Uploads, invoices and receipts for this employer collect here."
            />
          ) : (
            <ul className="divide-y">
              {employerDocuments.slice(0, 15).map((d) => (
                <li key={`${d.kind}-${d.id}`} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{d.reference}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.typeLabel} · {format(d.createdAt, 'd MMM yyyy · HH:mm')}
                    </p>
                  </div>
                  {d.amount && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(d.amount, d.currencyCode ?? 'EUR')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const activityTab = (
    <div className="mt-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="capitalize">{a.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.actorName ?? 'System'} · {format(a.occurredAt, 'd MMM yyyy · HH:mm')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Page ───────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <nav className="mb-4 text-sm text-muted-foreground">
          <Link href="/employers" className="hover:text-foreground hover:underline">
            Employers
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{employer.legalName}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/70"
            >
              <Building2 className="size-7" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {employer.legalName}
                </h1>
                <Badge variant={statusTone(employer.relationshipStatus)} className="rounded-full">
                  {employer.relationshipStatus.replace(/_/g, ' ')}
                </Badge>
              </div>
              {employer.tradingName && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Trading as {employer.tradingName}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  Owner:
                  <OwnerAvatar
                    user={
                      assignedOwner
                        ? { id: assignedOwner.id, fullName: assignedOwner.fullName }
                        : null
                    }
                    size="sm"
                    showName
                  />
                </span>
                {employer.industry && (
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="size-3" aria-hidden />
                    {employer.industry}
                  </span>
                )}
                {location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden />
                    {location}
                  </span>
                )}
                {employer.website && (
                  <a
                    href={employer.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <Globe className="size-3" aria-hidden />
                    {employer.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>
          </div>

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
        </div>

        {/* KPI strip — live demand only, from R0-corrected counters. */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            icon={Briefcase}
            label="Active requirements"
            value={activeReqs.length}
            hint="Jobs currently open"
            tone="blue"
          />
          <KpiTile
            icon={Users}
            label="Positions required"
            value={kpiRequired}
            hint="Across active jobs"
            tone="amber"
          />
          <KpiTile
            icon={CheckCircle2}
            label="Confirmed placed"
            value={kpiFilled}
            hint="Seats filled by placements"
            tone="green"
          />
          <KpiTile
            icon={User}
            label="Remaining"
            value={kpiRemaining}
            hint="Seats still to fill"
            tone="rose"
          />
        </div>
      </FadeUp>

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

      {/* R1 — compact onboarding strip: one line, blockers vs
          recommendation clearly separated, each item a direct pointer. */}
      {!onboardingComplete && (
        <FadeUp delay={0.025}>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/40">
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
            {canCompleteOnboarding && <CompleteOnboardingButton employerId={employer.id} />}
          </div>
        </FadeUp>
      )}

      <FadeUp delay={0.05} className="mt-6">
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
