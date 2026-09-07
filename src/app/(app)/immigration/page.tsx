import { PlaneTakeoff, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Button } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchCases } from '@/modules/immigration/service';
import { fetchPersons } from '@/modules/persons/service';
import { CaseDialog } from './case-dialog';
import { CasesTable } from './cases-table';

export const dynamic = 'force-dynamic';

export default async function ImmigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string }>;
}) {
  await requireInternalStaff();
  const { assigned } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const [cases, persons, employers] = await Promise.all([
    fetchCases(scope),
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
            <div className="flex items-center gap-2">
              <ScopeFilter current={scope} />
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
