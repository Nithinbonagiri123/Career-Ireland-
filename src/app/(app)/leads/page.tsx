import { UserPlus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchLeads } from '@/modules/leads/service';
import { CreateLeadDialog } from './create-lead-dialog';
import { LeadsTable } from './leads-table';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string }>;
}) {
  const session = await requireInternalStaff();
  const { assigned } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const leads = await fetchLeads(scope);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserPlus}
          title="Leads"
          description="Every candidate begins as a Lead. Convert via verified payment or a staff manual override (audited)."
          action={
            <div className="flex items-center gap-2">
              <ScopeFilter current={scope} />
              <CsvExportButton href="/api/export/leads" />
              <CreateLeadDialog />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <LeadsTable leads={leads} currentUserId={session.user.id} />
      </FadeUp>
    </div>
  );
}
