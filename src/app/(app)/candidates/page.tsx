import { Archive, CheckCircle2, Plus, Target, Users, UserX } from 'lucide-react';
import Link from 'next/link';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchCandidates } from '@/modules/candidates/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CandidatesCardGrid } from './candidate-card';
import { filterCandidates, matchesStatus, sortCandidates } from './candidate-filters';
import { CandidatesInlineFilterBar } from './candidates-filter-bar';
import { CandidatesTable } from './candidates-table';

export const dynamic = 'force-dynamic';

type SP = {
  assigned?: string;
  created?: string;
  from?: string;
  to?: string;
  view?: string;
  q?: string;
  status?: string;
  profession?: string;
  country?: string;
  assignee?: string;
  immigration?: string;
  sort?: string;
  page?: string;
  per?: string;
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'AVAILABLE', label: 'Available', tone: 'green' },
  { key: 'PLACED', label: 'Placed', tone: 'violet' },
  { key: 'UNASSIGNED', label: 'Unassigned', tone: 'amber' },
  { key: 'ARCHIVED', label: 'Archived', tone: 'slate' },
] as const;
const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name A–Z' },
];
const PER_OPTIONS = [12, 24, 48];

/**
 * Stage 6G — Candidates list (approved mockup 03) on the shared kit: page
 * header, KPI tiles, scope / date / view row, filter bar (multi-select,
 * "More filters" on phones), status tabs + sort, cards or table, and
 * pagination. Filtering, sorting and paging happen here once, so the card
 * grid and the table always show the same rows; every choice is in the URL.
 */
export default async function CandidatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('candidate_services', 'candidates', 'view');
  await requireInternalStaff();
  const sp = await searchParams;
  const scope = parseAssignmentScope(sp.assigned);
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  // Cards are the default; `view=table` opts into the table.
  const tableView = sp.view === 'table';
  const [candidates, staffUsers, occupations] = await Promise.all([
    fetchCandidates(scope, createdRange),
    fetchStaffUserOptions(),
    fetchOccupations(),
  ]);
  const occupationNames = new Map(occupations.map((o) => [o.id, o.name]));

  // ── KPI tiles over the current scope + date range.
  const totalCount = candidates.length;
  const availableCount = candidates.filter((c) => c.availabilityStatus === 'AVAILABLE').length;
  const placedCount = candidates.filter((c) => c.availabilityStatus === 'PLACED').length;
  const unassignedCount = candidates.filter((c) => !c.assignedUserId).length;

  // ── Filters → status tab counts → rows → sort → page.
  const filters = {
    q: sp.q,
    status: sp.status,
    profession: sp.profession,
    country: sp.country,
    assignee: sp.assignee,
    immigration: sp.immigration,
  };
  const beforeStatus = filterCandidates(candidates, filters, occupationNames, {
    ignoreStatus: true,
  });
  const rows = sortCandidates(filterCandidates(candidates, filters, occupationNames), sp.sort);
  const pageData = paginate(rows, sp.page, sp.per, PER_OPTIONS);

  // Filter options come from the rows in scope so every choice can match.
  const assigneeMap = new Map<string, string>();
  for (const c of candidates) {
    if (c.assignedUserId && c.assignedUserName)
      assigneeMap.set(c.assignedUserId, c.assignedUserName);
  }
  const assignees = Array.from(assigneeMap, ([id, fullName]) => ({ id, fullName })).sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );
  const nationalities = Array.from(
    new Set(candidates.map((c) => c.currentCountry).filter((v): v is string => Boolean(v))),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users}
          iconTone="blue"
          title="Candidates"
          description="Active talent pool shared across Candidate Services and Recruitment — each person is a single record. Click any card for the full profile."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CsvExportButton href="/api/export/candidates" />
              <Link href="/candidates/new" className={buttonVariants({ size: 'default' })}>
                <Plus className="mr-1.5 size-4" />
                Add candidate
              </Link>
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Users}
            tone="blue"
            label="Total candidates"
            value={totalCount}
            hint="Every candidate on file"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Available"
            value={availableCount}
            hint="Ready to be matched"
          />
          <StatTile
            icon={Target}
            tone="violet"
            label="Placed"
            value={placedCount}
            hint="On an active placement"
          />
          <StatTile
            icon={UserX}
            tone="amber"
            label="Unassigned"
            value={unassignedCount}
            hint="Not assigned to staff"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <ScopeFilter current={scope} />
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <DateRangeFilter className="min-w-0 max-w-full" />
            <ViewToggle current={tableView ? 'table' : 'cards'} defaultView="cards" />
          </div>
        </div>
        <div className="mt-3">
          <CandidatesInlineFilterBar
            countries={nationalities}
            occupations={occupations.map((o) => ({ id: o.id, name: o.name }))}
            assignees={assignees}
          />
        </div>
      </FadeUp>

      {scope === 'mine' && candidates.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="candidates" seeAllHref="/candidates?assigned=all" />
        </FadeUp>
      )}

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Candidate status"
            // Same behaviour as before Stage 6G: every status tab looks
            // across all owners (`assigned=all`), and "Unassigned" is the
            // unassigned scope, so the default "Assigned to me" scope never
            // hides a tab's candidates.
            tabs={STATUS_TABS.map((t) => {
              const unassignedTab = t.key === 'UNASSIGNED';
              const noStatus = !sp.status;
              return {
                key: t.key,
                label: t.label,
                tone: 'tone' in t ? t.tone : undefined,
                count:
                  t.key === 'all'
                    ? beforeStatus.length
                    : beforeStatus.filter((c) => matchesStatus(c, t.key)).length,
                set: (unassignedTab
                  ? { status: null, assigned: 'unassigned' }
                  : { assigned: 'all' }) as Record<string, string | null>,
                active: unassignedTab
                  ? (noStatus && scope === 'unassigned') || sp.status === 'UNASSIGNED'
                  : t.key === 'all'
                    ? noStatus && scope !== 'unassigned'
                    : sp.status === t.key,
              };
            })}
            sort={SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="mt-4">
          {tableView ? (
            <>
              {/* Phones get cards in table view — seven columns don't fit. */}
              <div className="hidden md:block">
                <CandidatesTable
                  candidates={pageData.items}
                  staffUsers={staffUsers.map((u) => ({
                    id: u.id,
                    fullName: u.fullName,
                    email: u.email,
                  }))}
                />
              </div>
              <div className="md:hidden">
                {pageData.total > 0 && <CandidatesCardGrid candidates={pageData.items} />}
              </div>
            </>
          ) : pageData.total === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
              <EmptyState
                icon={candidates.length === 0 ? Users : Archive}
                title={
                  candidates.length === 0
                    ? 'No candidates yet'
                    : 'No candidates match the current filters'
                }
                description={
                  candidates.length === 0
                    ? 'Candidates land here once a lead is accepted — automatically when payment is verified, or manually from the lead row.'
                    : 'Clear a filter or pick another status tab.'
                }
              />
            </div>
          ) : (
            <CandidatesCardGrid candidates={pageData.items} />
          )}
          <Pagination
            basePath="/candidates"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="candidates"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}
