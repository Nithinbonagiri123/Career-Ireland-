import { UserPlus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { ListSummaryStrip, type SummaryChip } from '@/components/list-summary-strip';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import type { Lead } from '@/lib/db/schema/leads';
import { parseAssignmentScope } from '@/lib/scope';
import { resolveCurrentWorkspace } from '@/lib/workspace';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchLeads } from '@/modules/leads/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { CreateLeadDialog } from './create-lead-dialog';
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

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string; created?: string; from?: string; to?: string }>;
}) {
  const session = await requirePermission('candidate_services', 'leads', 'view');
  const { assigned, created, from, to } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  // Scope the leads list to the active workspace: Candidate Services /
  // Recruitment / Immigration workspaces show only their own leads. Main
  // dashboard shows every lead combined — the owner needs the full view.
  const workspace = await resolveCurrentWorkspace();
  const targetBusiness = workspace ? targetBusinessForWorkspace(workspace.current) : undefined;
  const [leads, invoiceableServices, currencies, occupations] = await Promise.all([
    fetchLeads(scope, createdRange, targetBusiness),
    // PERSON-payable services + packages; the row-menu "Generate
    // invoice" dialog needs the full option list to render locally.
    fetchInvoiceableServicesFor('PERSON'),
    fetchCurrencies(),
    // Occupation catalog for the CS lead-creation form's profession
    // picker. Reused same options everywhere; inline-created rows
    // appear in the picker's local state until the next refetch.
    fetchOccupations(),
  ]);

  const mineCount = leads.filter((l) => l.assignedUserId === session.user.id).length;
  const newCount = leads.filter((l) => l.status === 'NEW').length;
  const contactedCount = leads.filter((l) => l.status === 'CONTACTED').length;
  const awaitingPaymentCount = leads.filter((l) => l.status === 'AWAITING_PAYMENT').length;
  const convertedCount = leads.filter((l) => l.status === 'CONVERTED').length;
  const summaryChips: SummaryChip[] = [
    { label: 'mine', value: mineCount, tone: 'info' },
    { label: 'new', value: newCount },
    { label: 'contacted', value: contactedCount },
    { label: 'awaiting payment', value: awaitingPaymentCount, tone: 'warning' },
    { label: 'converted', value: convertedCount, tone: 'success' },
  ];
  // Session 35 — `mine` is the default; only non-default scopes earn a chip.
  const activeFilters =
    scope === 'all'
      ? [{ label: 'scope: everyone' }]
      : scope === 'unassigned'
        ? [{ label: 'scope: unassigned' }]
        : [];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserPlus}
          iconTone="yellow"
          title="Leads"
          description="Every candidate begins as a Lead. Convert via verified payment or a staff manual override (audited)."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <ScopeFilter current={scope} />
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
      <FadeUp delay={0.05}>
        <ListSummaryStrip
          total={leads.length}
          totalLabel="leads"
          chips={summaryChips}
          filters={activeFilters}
        />
      </FadeUp>
      {scope === 'mine' && leads.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="leads" seeAllHref="/leads?assigned=all" />
        </FadeUp>
      )}
      <FadeUp delay={0.08}>
        <LeadsTable
          leads={leads}
          currentUserId={session.user.id}
          currentUserRole={session.user.role}
          invoiceableServices={invoiceableServices}
          occupations={occupations.map((o) => ({ id: o.id, name: o.name }))}
          countries={Array.from(
            new Set(leads.map((l) => l.personCountry).filter((c): c is string => Boolean(c))),
          ).sort((a, b) => a.localeCompare(b))}
        />
      </FadeUp>
    </div>
  );
}
