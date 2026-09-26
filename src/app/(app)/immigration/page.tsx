import { PlaneTakeoff, Plus } from 'lucide-react';
import { CaseScopeTabs } from '@/components/case-scope-tabs';
import { CsvExportButton } from '@/components/csv-export-button';
import { ListSummaryStrip, type SummaryChip } from '@/components/list-summary-strip';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { CASE_STAGE_LABEL } from '@/modules/immigration/labels';
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
  const session = await requireInternalStaff();
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

  // Rollups for the summary strip — grouped by stage buckets that match the
  // spec's user-facing lifecycle (New Candidate → Doc Collection → In
  // Progress → Approved/Rejected).
  const stageCounts = cases.reduce<Record<string, number>>((acc, c) => {
    const label = CASE_STAGE_LABEL[c.status];
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const mineCount = cases.filter((c) => c.assignedUserId === session.user.id).length;
  const summaryChips: SummaryChip[] = [
    { label: 'mine', value: mineCount, tone: 'info' },
    { label: 'new', value: stageCounts['New Candidate'] ?? 0 },
    { label: 'documents', value: stageCounts['Document Collection'] ?? 0 },
    { label: 'in progress', value: stageCounts['Application In Progress'] ?? 0, tone: 'warning' },
    { label: 'approved', value: stageCounts.Approved ?? 0, tone: 'success' },
    { label: 'rejected', value: stageCounts.Rejected ?? 0, tone: 'destructive' },
  ];
  const activeFilters =
    scope === 'mine'
      ? [{ label: 'scope: My Cases' }]
      : scope === 'unassigned'
        ? [{ label: 'scope: Unassigned' }]
        : [];

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
        <ListSummaryStrip
          total={cases.length}
          totalLabel="cases"
          chips={summaryChips}
          filters={activeFilters}
        />
      </FadeUp>
      <FadeUp delay={0.08}>
        {cardView ? <CasesCardGrid cases={cases} /> : <CasesTable cases={cases} />}
      </FadeUp>
    </div>
  );
}
