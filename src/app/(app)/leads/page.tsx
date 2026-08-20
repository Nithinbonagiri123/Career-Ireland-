import { UserPlus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchLeads } from '@/modules/leads/service';
import { CreateLeadDialog } from './create-lead-dialog';
import { LeadsTable } from './leads-table';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const leads = await fetchLeads();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserPlus}
          title="Leads"
          description="Every candidate begins as a Lead. Convert via verified payment or a staff manual override (audited)."
          action={
            <div className="flex gap-2">
              <CsvExportButton href="/api/export/leads" />
              <CreateLeadDialog />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <LeadsTable leads={leads} />
      </FadeUp>
    </div>
  );
}
