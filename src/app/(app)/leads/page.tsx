import { UserPlus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { ListSummaryStrip, type SummaryChip } from '@/components/list-summary-strip';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchLeads } from '@/modules/leads/service';
import { CreateLeadDialog } from './create-lead-dialog';
import { LeadsTable } from './leads-table';

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
  const [leads, invoiceableServices, currencies] = await Promise.all([
    fetchLeads(scope, createdRange),
    // PERSON-payable services + packages; the row-menu "Generate
    // invoice" dialog needs the full option list to render locally.
    fetchInvoiceableServicesFor('PERSON'),
    fetchCurrencies(),
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
  const activeFilters =
    scope === 'mine'
      ? [{ label: 'scope: mine' }]
      : scope === 'unassigned'
        ? [{ label: 'scope: unassigned' }]
        : [];

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
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
              <CreateLeadDialog invoiceableServices={invoiceableServices} currencies={currencies} />
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
      <FadeUp delay={0.08}>
        <LeadsTable
          leads={leads}
          currentUserId={session.user.id}
          invoiceableServices={invoiceableServices}
        />
      </FadeUp>
    </div>
  );
}
