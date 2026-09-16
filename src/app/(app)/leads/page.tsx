import { UserPlus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
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
  const [leads, invoiceableServices] = await Promise.all([
    fetchLeads(scope, createdRange),
    // PERSON-payable services + packages; the row-menu "Generate
    // invoice" dialog needs the full option list to render locally.
    fetchInvoiceableServicesFor('PERSON'),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserPlus}
          title="Leads"
          description="Every candidate begins as a Lead. Convert via verified payment or a staff manual override (audited)."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <ScopeFilter current={scope} />
              <CsvExportButton href="/api/export/leads" />
              <CreateLeadDialog invoiceableServices={invoiceableServices} />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <LeadsTable
          leads={leads}
          currentUserId={session.user.id}
          invoiceableServices={invoiceableServices}
        />
      </FadeUp>
    </div>
  );
}
