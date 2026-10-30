import { asc } from 'drizzle-orm';
import { Briefcase, CheckCircle2, Plus, UserRoundSearch, Users } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EntityCardGrid } from '@/components/ds/entity-card';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Button } from '@/components/ui/button';
import { checkPermission, requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { occupations } from '@/lib/db/schema/occupations';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchEmployers } from '@/modules/employers/service';
import {
  fetchRequisitionsWithCounts,
  type RequisitionCardRow,
} from '@/modules/requisitions/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { EMPLOYMENT_LABEL, JobCard } from './job-card';
import { RequisitionDialog } from './requisition-dialog';
import { RequisitionsTable } from './requisitions-table';

export const dynamic = 'force-dynamic';

type SP = {
  assigned?: string;
  created?: string;
  from?: string;
  to?: string;
  view?: string;
  q?: string;
  status?: string;
  employer?: string;
  type?: string;
  owner?: string;
  sort?: string;
  page?: string;
  per?: string;
};

const ACTIVE = new Set(['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED']);
const STATUS_TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'open', label: 'Open', tone: 'blue', match: (s: string) => s === 'OPEN' },
  {
    key: 'in_progress',
    label: 'In progress',
    tone: 'violet',
    match: (s: string) => s === 'IN_PROGRESS',
  },
  {
    key: 'partial',
    label: 'Partially filled',
    tone: 'amber',
    match: (s: string) => s === 'PARTIALLY_FILLED',
  },
  { key: 'filled', label: 'Filled', tone: 'green', match: (s: string) => s === 'FILLED' },
  { key: 'draft', label: 'Draft', tone: 'slate', match: (s: string) => s === 'DRAFT' },
  {
    key: 'closed',
    label: 'Closed',
    tone: 'rose',
    match: (s: string) => s === 'CLOSED' || s === 'CANCELLED',
  },
] as const;
const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'remaining', label: 'Most seats to fill' },
  { value: 'target', label: 'Target fill date' },
];
const PER_OPTIONS = [12, 24, 48];

/**
 * Stage 6G — Job requisitions list (approved mockups 01 / 03 language):
 * page header with primary actions only, KPI tiles, scope / date / view
 * row, filter toolbar, status tabs with counts + sort, job cards or table,
 * pagination. All filters are URL params.
 */
export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'requisitions', 'view');
  await requireInternalStaff();
  // R6 — controls follow recruitment.requisitions (server actions re-check).
  const [canCreateJob, canEditJob] = await Promise.all([
    checkPermission('recruitment', 'requisitions', 'create'),
    checkPermission('recruitment', 'requisitions', 'edit'),
  ]);
  const sp = await searchParams;
  const scope = parseAssignmentScope(sp.assigned);
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  // Cards are the default; `view=table` opts into the table.
  const cardView = sp.view !== 'table';
  const [jobs, employers, currencies, occupationList, staffUsers] = await Promise.all([
    fetchRequisitionsWithCounts(scope, createdRange),
    fetchEmployers(),
    fetchCurrencies(),
    db.select().from(occupations).orderBy(asc(occupations.name)),
    fetchStaffUserOptions(),
  ]);
  const owners = staffUsers.map((u) => ({ id: u.id, fullName: u.fullName }));

  // ── KPI tiles (current scope + date range).
  const active = jobs.filter((j) => ACTIVE.has(j.status));
  const seatsToFill = active.reduce(
    (n, j) => n + Math.max(0, j.positionsRequired - j.positionsFilled),
    0,
  );
  const filled = jobs.filter((j) => j.status === 'FILLED').length;
  const inPlay = active.reduce((n, j) => n + j.shortlistedCount + j.appliedCount, 0);

  // ── Filters (search / selects) then status tab, sort, page.
  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = jobs.filter(
    (j) =>
      (!q ||
        [j.title, j.employerName, j.location ?? '', j.occupationName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)) &&
      (!sp.employer || j.employerId === sp.employer) &&
      (!sp.type || j.employmentType === sp.type) &&
      (!sp.owner || (sp.owner === 'none' ? !j.assignedUserId : j.assignedUserId === sp.owner)),
  );
  const tab = STATUS_TABS.find((t) => t.key === sp.status) ?? STATUS_TABS[0];
  const tabbed = filtered.filter((j) => tab.match(j.status));
  const sorted = sortJobs(tabbed, sp.sort);
  const pageData = paginate(sorted, sp.page, sp.per, PER_OPTIONS);

  const employerOptions = Array.from(new Map(jobs.map((j) => [j.employerId, j.employerName])))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
  const ownerOptions = Array.from(
    new Map(
      jobs
        .filter((j) => j.assignedUserId)
        .map((j) => [j.assignedUserId as string, j.ownerName ?? 'Staff']),
    ),
  ).map(([value, label]) => ({ value, label }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Briefcase}
          iconTone="purple"
          title="Job requisitions"
          description="Employer staffing needs. Each requisition has its own lifecycle, matches, applications and placements."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CsvExportButton href="/api/export/requisitions" />
              {canCreateJob && (
                <RequisitionDialog
                  employers={employers}
                  currencies={currencies}
                  occupations={occupationList}
                  trigger={
                    <Button disabled={employers.length === 0}>
                      <Plus className="mr-1.5 size-4" /> New requisition
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Briefcase}
            tone="blue"
            label="Open jobs"
            value={active.length}
            hint="Accepting candidates"
          />
          <StatTile
            icon={Users}
            tone="amber"
            label="Seats to fill"
            value={seatsToFill}
            hint="Across open jobs"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Filled"
            value={filled}
            hint="Every seat placed"
          />
          <StatTile
            icon={UserRoundSearch}
            tone="violet"
            label="Candidates in play"
            value={inPlay}
            hint="Shortlisted or applied"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <ScopeFilter current={scope} />
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <DateRangeFilter className="min-w-0 max-w-full" />
            <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="cards" />
          </div>
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search jobs by title, employer, location…"
            selects={[
              {
                param: 'employer',
                label: 'Employer',
                options: [{ value: '', label: 'All employers' }, ...employerOptions],
              },
              {
                param: 'type',
                label: 'Employment type',
                options: [
                  { value: '', label: 'All types' },
                  ...Object.entries(EMPLOYMENT_LABEL).map(([value, label]) => ({ value, label })),
                ],
              },
              {
                param: 'owner',
                label: 'Owner',
                options: [
                  { value: '', label: 'All staff' },
                  { value: 'none', label: 'Unassigned' },
                  ...ownerOptions,
                ],
              },
            ]}
          />
        </div>
      </FadeUp>

      {scope === 'mine' && jobs.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="requisitions" seeAllHref="/requisitions?assigned=all" />
        </FadeUp>
      )}

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Job status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count: filtered.filter((j) => t.match(j.status)).length,
            }))}
            sort={SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="mt-4">
          {pageData.total === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
              <EmptyState
                icon={Briefcase}
                title={jobs.length === 0 ? 'No requisitions yet' : 'No jobs match these filters'}
                description={
                  jobs.length === 0
                    ? 'Create a requisition for an employer to start matching candidates.'
                    : 'Clear the filters or pick another status tab.'
                }
              />
            </div>
          ) : cardView ? (
            <EntityCardGrid>
              {pageData.items.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </EntityCardGrid>
          ) : (
            <RequisitionsTable requisitions={pageData.items} owners={owners} canEdit={canEditJob} />
          )}
          <Pagination
            basePath="/requisitions"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="jobs"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}

function sortJobs(rows: RequisitionCardRow[], sort: string | undefined): RequisitionCardRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'remaining':
      return copy.sort(
        (a, b) =>
          b.positionsRequired - b.positionsFilled - (a.positionsRequired - a.positionsFilled),
      );
    case 'target':
      return copy.sort((a, b) =>
        (a.targetFillDate ?? '9999').localeCompare(b.targetFillDate ?? '9999'),
      );
    default:
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
