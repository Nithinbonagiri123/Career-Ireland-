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
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { NextActionCard } from '@/components/next-action-card';
import { PageHeader } from '@/components/page-header';
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
import { fetchCurrencies } from '@/modules/currencies/service';
import { computeEmployerNextAction } from '@/modules/employers/next-action';
import { fetchEmployer, fetchEmployerContacts, fetchEmployers } from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { fetchPersons } from '@/modules/persons/service';
import { fetchRequisitionsForEmployer } from '@/modules/requisitions/service';
import { CaseDialog } from '../../immigration/case-dialog';
import { RequisitionDialog } from '../../requisitions/requisition-dialog';
import { EmployerDialog } from '../employer-dialog';
import { ContactDialog } from './contact-dialog';

export const dynamic = 'force-dynamic';

export default async function EmployerDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ raisePlacement?: string; raiseRequisition?: string }>;
}) {
  const session = await requireInternalStaff();
  const { id } = await params;
  const { raisePlacement, raiseRequisition } = await searchParams;
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

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <Badge variant={statusTone(employer.relationshipStatus)} className="rounded-full">
        {employer.relationshipStatus.replace(/_/g, ' ')}
      </Badge>
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
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          title={employer.legalName}
          description={employer.tradingName ? `Trading as ${employer.tradingName}` : undefined}
          breadcrumbs={[{ label: 'Employers', href: '/employers' }, { label: employer.legalName }]}
          meta={metaStrip}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <AssignToMeButton
                entity="employer"
                id={employer.id}
                currentUserId={session.user.id}
                currentAssignedUserId={employer.assignedUserId}
              />
              <EmployerDialog
                initial={employer}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="mr-1.5 size-4" /> Edit
                  </Button>
                }
              />
              <GenerateInvoiceDialog
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
              />
              {/* Session 5: distinct "Raise placement fee" entry point that
                  was previously only reachable by landing on this page
                  via ?raisePlacement=…. Only shown when there's actually
                  a placement that needs billing. */}
              {firstRaisablePlacement && !raisePlacement && (
                <Link
                  href={`/employers/${employer.id}?raisePlacement=${firstRaisablePlacement.id}`}
                  className={buttonVariants({ size: 'sm', variant: 'outline' })}
                >
                  <Coins className="mr-1.5 size-4" aria-hidden /> Raise placement fee
                </Link>
              )}
              {/* Session 5: start an immigration case directly from the
                  employer — sponsor is pre-filled to this employer. */}
              <CaseDialog
                persons={allPersons}
                employers={employersAll}
                applicationTypes={allApplicationTypes}
                prefill={{ sponsorEmployerId: employer.id }}
                trigger={
                  <Button size="sm" variant="outline">
                    <PlaneTakeoff className="mr-1.5 size-4" /> Start immigration case
                  </Button>
                }
              />
              <RequisitionDialog
                employers={employersAll}
                currencies={currencies}
                occupations={occupationList}
                defaultEmployerId={employer.id}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> New requisition
                  </Button>
                }
              />
            </div>
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
