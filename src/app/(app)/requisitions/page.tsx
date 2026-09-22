import { asc } from 'drizzle-orm';
import { Briefcase, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Button } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { occupations } from '@/lib/db/schema/occupations';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchEmployers } from '@/modules/employers/service';
import {
  fetchRequisitions,
  fetchRequisitionsWithCounts,
} from '@/modules/requisitions/service';
import {
  RequisitionsCardGrid,
  RequisitionsViewToggle,
} from './requisition-card';
import { RequisitionDialog } from './requisition-dialog';
import { RequisitionsTable } from './requisitions-table';

export const dynamic = 'force-dynamic';

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    assigned?: string;
    created?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  await requirePermission('recruitment', 'requisitions', 'view');
  const { assigned, created, from, to, view } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  // `view=table` opts back into the legacy row layout — cards are the
  // default because they surface the matched/applied/shortlisted counters
  // that operators previously had to drill into.
  const cardView = view !== 'table';
  const [requisitions, requisitionCards, employers, currencies, occupationList] =
    await Promise.all([
      cardView ? Promise.resolve([]) : fetchRequisitions(scope, createdRange),
      cardView ? fetchRequisitionsWithCounts(scope, createdRange) : Promise.resolve([]),
      fetchEmployers(),
      fetchCurrencies(),
      db.select().from(occupations).orderBy(asc(occupations.name)),
    ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Briefcase}
          iconTone="purple"
          title="Job requisitions"
          description="Employer staffing needs. Each requisition has its own lifecycle, matches, applications, and placements."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <RequisitionsViewToggle current={cardView ? 'grid' : 'table'} />
              <DateRangeFilter />
              <ScopeFilter current={scope} />
              <CsvExportButton href="/api/export/requisitions" />
              <RequisitionDialog
                employers={employers}
                currencies={currencies}
                occupations={occupationList}
                trigger={
                  <Button size="sm" disabled={employers.length === 0}>
                    <Plus className="mr-1.5 size-4" /> New requisition
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        {cardView ? (
          <RequisitionsCardGrid requisitions={requisitionCards} />
        ) : (
          <RequisitionsTable requisitions={requisitions} />
        )}
      </FadeUp>
    </div>
  );
}
