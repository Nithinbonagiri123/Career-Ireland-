import { CheckCircle2, Clock3, PhoneCall, Sparkles, UserPlus, Users } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { ViewToggle } from '@/components/ds/list-controls';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { hasFinanceAuthority } from '@/lib/auth/finance-policy-rules';
import { requireAnyPermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import type { Lead } from '@/lib/db/schema/leads';
import { parseAssignmentScope } from '@/lib/scope';
import { resolveCurrentWorkspace } from '@/lib/workspace';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchLeads } from '@/modules/leads/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { CreateLeadDialog } from './create-lead-dialog';
import { LeadsToolbar } from './leads-filter-bar';
import { LeadsTable } from './leads-table';

/** Workspace → lead target business. `main` returns undefined so the
 *  Main dashboard view keeps showing every lead across all three lines. */
function targetBusinessForWorkspace(ws: string): Lead['targetBusiness'] | undefined {
  if (ws === 'candidate_services') return 'CANDIDATE_SERVICES';
  if (ws === 'recruitment') return 'RECRUITMENT';
  if (ws === 'immigration') return 'IMMIGRATION';
  return undefined;
}

export const dynamic = 'force-dynamic';

/**
 * Stage 6G — Leads list (approved mockup 01) on the shared design kit:
 * page header with primary actions only, five summary tiles, scope /
 * created / view row, filter toolbar (multi-select Status / Assigned to /
 * Nationality + the full "Filter" menu), table (default) or lead cards,
 * pagination. Every filter lives in the URL; table and cards render the
 * same filtered, sorted, paginated rows.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    assigned?: string;
    created?: string;
    createdFrom?: string;
    createdTo?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  // R0 — leads serve every workspace; the recruitment sidebar used to
  // demand the candidate-services grant.
  const session = await requireAnyPermission([
    { business: 'candidate_services', module: 'leads', verb: 'view' },
    { business: 'recruitment', module: 'leads', verb: 'view' },
    { business: 'main', module: 'leads', verb: 'view' },
  ]);
  const { assigned, created, from, to, createdFrom, createdTo, view } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  // One date filter. `created` / `from` / `to` are canonical; the older
  // `createdFrom` / `createdTo` (Filter menu, bookmarks) are read as
  // aliases so existing links keep working. Filtering happens once, here.
  const createdRange = parseDateRangeParams({
    created,
    from: from ?? createdFrom,
    to: to ?? createdTo,
  });
  // Table stays the default (row actions + existing specs); `view=grid`
  // opts into cards. Phones always get cards.
  const cardView = view === 'grid';
  const workspace = await resolveCurrentWorkspace();
  const targetBusiness = workspace ? targetBusinessForWorkspace(workspace.current) : undefined;
  // Recruitment P0 — employer leads are billed to the employer, so the
  // convert / invoice dialogs need the EMPLOYER (+ ANY) catalog too.
  const [leads, invoiceableServices, employerServices, currencies, occupations] = await Promise.all(
    [
      fetchLeads(scope, createdRange, targetBusiness),
      fetchInvoiceableServicesFor('PERSON'),
      targetBusiness === undefined || targetBusiness === 'RECRUITMENT'
        ? fetchInvoiceableServicesFor('EMPLOYER')
        : Promise.resolve([]),
      fetchCurrencies(),
      fetchOccupations(),
    ],
  );
  const canIssueInvoices = hasFinanceAuthority(session.user, 'ISSUE');
  const canVerifyPayments = hasFinanceAuthority(session.user, 'VERIFY');

  const count = (s: Lead['status']) => leads.filter((l) => l.status === s).length;

  // Unique assignees + nationalities for the filter options — derived from
  // the current result set so every option can actually match.
  const assigneeMap = new Map<string, string>();
  for (const l of leads) {
    if (l.assignedUserId && l.assignedUserName && !assigneeMap.has(l.assignedUserId)) {
      assigneeMap.set(l.assignedUserId, l.assignedUserName);
    }
  }
  const assignees = Array.from(assigneeMap.entries())
    .map(([id, fullName]) => ({ id, fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const nationalities = Array.from(
    new Set(
      leads
        .map((l) => l.personNationality ?? l.personCountry)
        .filter((v): v is string => Boolean(v)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const occupationOptions = occupations.map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserPlus}
          iconTone="yellow"
          title="Leads"
          description={
            targetBusiness === 'RECRUITMENT'
              ? 'Employer enquiries. Qualify and assign them, then convert into a requisition once the employer has paid — using their paid invoice, or by recording the payment.'
              : 'Every candidate begins as a Lead. Convert via verified payment or a staff manual override (audited).'
          }
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CsvExportButton href="/api/export/leads" />
              <CreateLeadDialog
                invoiceableServices={invoiceableServices}
                currencies={currencies}
                occupations={occupations.map((o) => ({
                  id: o.id,
                  name: o.name,
                  isActive: o.isActive,
                }))}
              />
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid className="lg:grid-cols-5">
          <div className="col-span-2 lg:col-span-1">
            <StatTile
              icon={Users}
              tone="blue"
              label="Total leads"
              value={leads.length}
              hint="All leads in view"
            />
          </div>
          <StatTile
            icon={Sparkles}
            tone="violet"
            label="New"
            value={count('NEW')}
            hint="Not contacted yet"
          />
          <StatTile
            icon={PhoneCall}
            tone="teal"
            label="Contacted"
            value={count('CONTACTED')}
            hint="Initial contact made"
          />
          <StatTile
            icon={Clock3}
            tone="amber"
            label="Awaiting payment"
            value={count('AWAITING_PAYMENT')}
            hint="Pro forma accepted"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Converted"
            value={count('CONVERTED')}
            hint="Now clients"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <ScopeFilter current={scope} />
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <DateRangeFilter
              className="min-w-0 max-w-full"
              aliases={{ from: 'createdFrom', to: 'createdTo' }}
            />
            <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="table" />
          </div>
        </div>
        <div className="mt-3">
          <LeadsToolbar
            countries={nationalities}
            occupations={occupationOptions}
            assignees={assignees}
          />
        </div>
      </FadeUp>

      {scope === 'mine' && leads.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="leads" seeAllHref="/leads?assigned=all" />
        </FadeUp>
      )}

      <FadeUp delay={0.08}>
        <div className="mt-4">
          <LeadsTable
            leads={leads}
            view={cardView ? 'cards' : 'table'}
            currentUserId={session.user.id}
            currentUserRole={session.user.role}
            invoiceableServices={invoiceableServices}
            employerServices={employerServices}
            canIssueInvoices={canIssueInvoices}
            canVerifyPayments={canVerifyPayments}
          />
        </div>
      </FadeUp>
    </div>
  );
}
