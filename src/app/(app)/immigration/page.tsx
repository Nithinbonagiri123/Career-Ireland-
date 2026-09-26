import { PlaneTakeoff, Plus } from 'lucide-react';
import { CaseScopeTabs } from '@/components/case-scope-tabs';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { fetchCases } from '@/modules/immigration/service';
import { fetchPersons } from '@/modules/persons/service';
import { CasesCardGrid, CasesViewToggle } from './case-card';
import { CaseDialog } from './case-dialog';
import { CasesTable } from './cases-table';

export const dynamic = 'force-dynamic';

export default async function ImmigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string; view?: string }>;
}) {
  await requirePermission('immigration', 'cases', 'view');
  const { assigned, view } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  // Cards are the default because the spec (§11) wants owner + candidate name
  // at a glance across the whole list — the table is the drill-down view.
  const cardView = view !== 'table';
  const [cases, persons, employers, applicationTypes] = await Promise.all([
    fetchCases(scope),
    fetchPersons(),
    fetchEmployers(),
    fetchApplicationTypes(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={PlaneTakeoff}
          iconTone="pink"
          title="Immigration cases"
          description="Employment Permits, Visas, and Visa Extensions. Independent of placements — can run for any employer / person combination."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <CaseScopeTabs current={scope} />
              <CasesViewToggle current={cardView ? 'grid' : 'table'} />
              <CsvExportButton href="/api/export/immigration" />
              <CaseDialog
                persons={persons}
                employers={employers}
                applicationTypes={applicationTypes}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> Open case
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        {cardView ? <CasesCardGrid cases={cases} /> : <CasesTable cases={cases} />}
      </FadeUp>
    </div>
  );
}
