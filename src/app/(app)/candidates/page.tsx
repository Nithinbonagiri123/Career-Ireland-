import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { ListSummaryStrip, type SummaryChip } from '@/components/list-summary-strip';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchCandidates } from '@/modules/candidates/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CandidatesCardGrid, CandidatesViewToggle } from './candidate-card';
import { CandidatesTable } from './candidates-table';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage({
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
  await requirePermission('candidate_services', 'candidates', 'view');
  const session = await requireInternalStaff();
  const { assigned, created, from, to, view } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  const currentView: 'grid' | 'table' = view === 'table' ? 'table' : 'grid';
  const [candidates, staffUsers, settings] = await Promise.all([
    fetchCandidates(scope, createdRange),
    fetchStaffUserOptions(),
    fetchAppSettings(),
  ]);

  const availableCount = candidates.filter((c) => c.availabilityStatus === 'AVAILABLE').length;
  const placedCount = candidates.filter((c) => c.availabilityStatus === 'PLACED').length;
  const unavailableCount = candidates.filter(
    (c) => c.availabilityStatus === 'TEMPORARILY_UNAVAILABLE',
  ).length;
  const mineCount = candidates.filter((c) => c.assignedUserId === session.user.id).length;
  const summaryChips: SummaryChip[] = [
    { label: 'mine', value: mineCount, tone: 'info' },
    { label: 'available', value: availableCount, tone: 'success' },
    { label: 'placed', value: placedCount },
    { label: 'unavailable', value: unavailableCount, tone: 'warning' },
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
          icon={Users}
          iconTone="blue"
          title="Candidates"
          description={`${settings.legalName}'s active talent pool. Shared across Candidate Services and Recruitment — each person is a single record. Click any row for the full timeline.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <ScopeFilter current={scope} />
              <CandidatesViewToggle current={currentView} />
              <CsvExportButton href="/api/export/candidates" />
              <Link href="/candidates/new" className={buttonVariants({ size: 'default' })}>
                <Plus className="mr-1.5 size-4" />
                Add candidate
              </Link>
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <ListSummaryStrip
          total={candidates.length}
          totalLabel="candidates"
          chips={summaryChips}
          filters={activeFilters}
        />
      </FadeUp>
      <FadeUp delay={0.08}>
        {currentView === 'grid' ? (
          <CandidatesCardGrid candidates={candidates} />
        ) : (
          <CandidatesTable
            candidates={candidates}
            staffUsers={staffUsers.map((u) => ({
              id: u.id,
              fullName: u.fullName,
              email: u.email,
            }))}
          />
        )}
      </FadeUp>
    </div>
  );
}
