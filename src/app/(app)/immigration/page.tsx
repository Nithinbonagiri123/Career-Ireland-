import { PlaneTakeoff, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchCases } from '@/modules/immigration/service';
import { fetchPersons } from '@/modules/persons/service';
import { CaseDialog } from './case-dialog';
import { CasesTable } from './cases-table';

export const dynamic = 'force-dynamic';

export default async function ImmigrationPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const [cases, persons, employers] = await Promise.all([
    fetchCases(),
    fetchPersons(),
    fetchEmployers(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={PlaneTakeoff}
          title="Immigration cases"
          description="Employment Permits, Visas, and Visa Extensions. Independent of placements — can run for any employer / person combination."
          action={
            <div className="flex gap-2">
              <CsvExportButton href="/api/export/immigration" />
              <CaseDialog
                persons={persons}
                employers={employers}
                trigger={
                  <Button size="sm" disabled={persons.length === 0}>
                    <Plus className="mr-1.5 size-4" /> Open case
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CasesTable cases={cases} />
      </FadeUp>
    </div>
  );
}
