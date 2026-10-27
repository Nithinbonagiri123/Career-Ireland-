import { eq } from 'drizzle-orm';
import { ChevronLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { requireAnyPermission } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchLead } from '@/modules/leads/service';
import { fetchProFormasForLead, type ProFormaView } from '@/modules/proformas/service';
import { ProFormaComposer } from './pro-formas/pro-forma-composer';

export const dynamic = 'force-dynamic';

function statusTone(status: ProFormaView['status']) {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'ISSUED':
      return 'default';
    case 'ACCEPTED':
      return 'default';
    case 'CONVERTED':
      return 'default';
    case 'REJECTED':
    case 'CANCELLED':
    case 'SUPERSEDED':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // R0 — leads are multi-workspace: a recruitment lead used to demand the
  // candidate-services grant even inside the Recruitment workspace.
  await requireAnyPermission([
    { business: 'candidate_services', module: 'leads', verb: 'view' },
    { business: 'recruitment', module: 'leads', verb: 'view' },
    { business: 'main', module: 'leads', verb: 'view' },
  ]);
  const { id } = await params;

  const lead = await fetchLead(id);
  if (!lead) notFound();

  // Stage 6D Wave 4 — person-based leads redirect to the unified Client
  // Workspace. The workspace's Billing tab contains the inline quote
  // composer and all the lifecycle actions this page used to render.
  // Employer-based (Recruitment) leads keep this detail page because
  // they don't have a person-scoped workspace yet. The child routes
  // (/leads/[id]/pro-formas/[pfId], .../print) stay regardless — those
  // are deep-link targets from quotes PDFs, audit events + the
  // workspace itself.
  if (lead.personId) {
    redirect(`/clients/${lead.personId}?tab=billing`);
  }

  const [services, currencies] = await Promise.all([
    fetchInvoiceableServicesFor('PERSON'),
    fetchCurrencies(),
  ]);

  // Pro-formas are a Candidate Services feature. For non-CS leads we
  // just render the summary without a pro-forma panel.
  const isCS = lead.targetBusiness === 'CANDIDATE_SERVICES';
  const proFormas = isCS ? await fetchProFormasForLead(lead.id) : [];

  const [person] = lead.personId
    ? await db
        .select({
          firstName: persons.firstName,
          middleName: persons.middleName,
          lastName: persons.lastName,
          email: persons.email,
          phone: persons.phone,
          currentCity: persons.currentCity,
          currentCountry: persons.currentCountry,
        })
        .from(persons)
        .where(eq(persons.id, lead.personId))
        .limit(1)
    : [null];

  // R0 — an employer (Recruitment) lead used to render as "Unknown"
  // because this page only knew how to fetch a person. Load the employer
  // and its requisitions so the page shows the company, links to its
  // profile, and surfaces what the lead turned into.
  const [employer] = lead.employerId
    ? await db
        .select({
          id: employers.id,
          legalName: employers.legalName,
          industry: employers.industry,
          city: employers.city,
          country: employers.country,
          relationshipStatus: employers.relationshipStatus,
        })
        .from(employers)
        .where(eq(employers.id, lead.employerId))
        .limit(1)
    : [null];

  const employerRequisitions = lead.employerId
    ? await db
        .select({
          id: jobRequisitions.id,
          title: jobRequisitions.title,
          status: jobRequisitions.status,
        })
        .from(jobRequisitions)
        .where(eq(jobRequisitions.employerId, lead.employerId))
        .limit(10)
    : [];

  const payerName = person
    ? [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
    : (employer?.legalName ?? 'Unknown');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <div className="mb-4">
          <Link href="/leads" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            <ChevronLeft className="mr-1 h-4 w-4" /> All leads
          </Link>
        </div>
        <PageHeader
          icon={FileText}
          iconTone="yellow"
          title={payerName}
          description={`${lead.targetBusiness.replaceAll('_', ' ').toLowerCase()} · ${lead.status.toLowerCase()}`}
        />
        {employer && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <span>
              Employer enquiry from {employer.legalName}
              {employer.industry ? ` · ${employer.industry}` : ''}
              {employer.city
                ? ` · ${[employer.city, employer.country].filter(Boolean).join(', ')}`
                : ''}
              {' — '}status {employer.relationshipStatus.toLowerCase()}. Contacts, requisitions and
              billing live on the employer profile.
            </span>
            <Link
              href={`/employers/${employer.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open employer profile
            </Link>
          </div>
        )}
        {lead.personId && (
          /* Stage 6B compatibility banner — this detail page keeps the
             quote composer and the pro-forma lifecycle actions. Everything
             else about this person now lives on the unified Client
             Workspace. */
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <span>
              This is the quote composer for {payerName}. For the full client picture — identity,
              status, invoices, payments and activation — open the workspace.
            </span>
            <Link
              href={`/clients/${lead.personId}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Open workspace
            </Link>
          </div>
        )}
      </FadeUp>

      <FadeUp delay={0.05}>
        <section className="mt-6 rounded-md border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Lead details
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {person?.email && (
              <>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{person.email}</dd>
              </>
            )}
            {person?.phone && (
              <>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{person.phone}</dd>
              </>
            )}
            {person?.currentCity && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{[person.currentCity, person.currentCountry].filter(Boolean).join(', ')}</dd>
              </>
            )}
            {employerRequisitions.length > 0 && (
              <>
                <dt className="text-muted-foreground">Requisitions</dt>
                <dd className="space-y-0.5">
                  {employerRequisitions.map((r) => (
                    <Link
                      key={r.id}
                      href={`/requisitions/${r.id}`}
                      className="block truncate hover:underline"
                    >
                      {r.title} · {r.status.replaceAll('_', ' ').toLowerCase()}
                    </Link>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd>
              {new Date(lead.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </dd>
          </dl>
        </section>
      </FadeUp>

      {isCS && (
        <FadeUp delay={0.1}>
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Pro formas
                </h2>
                <p className="text-xs text-muted-foreground">
                  Composed offers. Multiple pro formas form a competing group — accepting one
                  supersedes the siblings.
                </p>
              </div>
              <ProFormaComposer
                mode="create"
                leadId={lead.id}
                services={services}
                currencies={currencies}
                triggerLabel="New pro forma"
              />
            </div>

            {proFormas.length === 0 ? (
              <div className="mt-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No pro formas yet. Create one to propose services and pricing.
              </div>
            ) : (
              <ul className="mt-3 divide-y rounded-md border bg-card">
                {proFormas.map((pf) => (
                  <li key={pf.id} className="flex items-center justify-between gap-4 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/leads/${lead.id}/pro-formas/${pf.id}`}
                          className="font-mono text-sm hover:underline"
                        >
                          {pf.number}
                        </Link>
                        <Badge variant={statusTone(pf.status)}>{pf.status}</Badge>
                        <span className="text-xs text-muted-foreground">rev {pf.revision}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {pf.lineItems.length} line{pf.lineItems.length === 1 ? '' : 's'}
                        {' · '}
                        {pf.issuedAt
                          ? `issued ${new Date(pf.issuedAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`
                          : `drafted ${new Date(pf.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold tabular-nums">
                        {formatCurrency(pf.subtotal, pf.currencyCode)}
                      </div>
                      <Link
                        href={`/leads/${lead.id}/pro-formas/${pf.id}`}
                        className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-1`}
                      >
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </FadeUp>
      )}
    </div>
  );
}
