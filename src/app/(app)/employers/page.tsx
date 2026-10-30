import { Building2, CircleDot, Handshake, Plus, UserX } from 'lucide-react';
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
import type { Employer } from '@/lib/db/schema/recruitment';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployerListStats, fetchEmployers } from '@/modules/employers/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { EmployerCard } from './employer-card';
import { EmployerDialog } from './employer-dialog';
import { EmployersTable } from './employers-table';

export const dynamic = 'force-dynamic';

type SP = {
  assigned?: string;
  created?: string;
  from?: string;
  to?: string;
  view?: string;
  q?: string;
  status?: string;
  industry?: string;
  owner?: string;
  sort?: string;
  page?: string;
  per?: string;
};

const STATUS_TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'active', label: 'Active', tone: 'green', match: (s: string) => s === 'ACTIVE' },
  { key: 'prospect', label: 'Prospect', tone: 'amber', match: (s: string) => s === 'PROSPECT' },
  { key: 'on_hold', label: 'On hold', tone: 'slate', match: (s: string) => s === 'ON_HOLD' },
] as const;
const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name A–Z' },
];
const PER_OPTIONS = [12, 24, 48];

/**
 * Stage 6G — Employers list (approved mockups 01 / 03 language): header
 * with primary actions only, KPI tiles, scope / date / view row, filter
 * toolbar, status tabs + sort, table (default) or employer cards,
 * pagination. All filters are URL params.
 */
export default async function EmployersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'employers', 'view');
  await requireInternalStaff();
  // R6 — controls follow recruitment.employers (server actions re-check).
  const [canCreateEmployer, canEditEmployer] = await Promise.all([
    checkPermission('recruitment', 'employers', 'create'),
    checkPermission('recruitment', 'employers', 'edit'),
  ]);
  const sp = await searchParams;
  const scope = parseAssignmentScope(sp.assigned);
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  // Table stays the default for employers; `view=grid` opts into cards.
  const cardView = sp.view === 'grid';
  const [employers, settings, staffUsers, stats] = await Promise.all([
    fetchEmployers(scope, createdRange),
    fetchAppSettings(),
    fetchStaffUserOptions(),
    fetchEmployerListStats(),
  ]);
  const owners = staffUsers.map((u) => ({ id: u.id, fullName: u.fullName }));
  const ownerName = new Map(owners.map((o) => [o.id, o.fullName]));

  // ── KPI tiles (current scope + date range).
  const activeCount = employers.filter((e) => e.relationshipStatus === 'ACTIVE').length;
  const prospectCount = employers.filter((e) => e.relationshipStatus === 'PROSPECT').length;
  const unassignedCount = employers.filter((e) => !e.assignedUserId).length;

  // ── Filters, then status tab, sort, page.
  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = employers.filter(
    (e) =>
      (!q ||
        [e.legalName, e.tradingName ?? '', e.industry ?? '', e.city ?? '', e.country ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)) &&
      (!sp.industry || e.industry === sp.industry) &&
      (!sp.owner || (sp.owner === 'none' ? !e.assignedUserId : e.assignedUserId === sp.owner)),
  );
  const tab = STATUS_TABS.find((t) => t.key === sp.status) ?? STATUS_TABS[0];
  const tabbed = filtered.filter((e) => tab.match(e.relationshipStatus));
  const sorted = sortEmployers(tabbed, sp.sort);
  const pageData = paginate(sorted, sp.page, sp.per, PER_OPTIONS);

  const industryOptions = Array.from(
    new Set(employers.map((e) => e.industry).filter((v): v is string => Boolean(v))),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));
  const ownerOptions = Array.from(
    new Set(employers.map((e) => e.assignedUserId).filter((v): v is string => Boolean(v))),
  ).map((id) => ({ value: id, label: ownerName.get(id) ?? 'Staff' }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          iconTone="purple"
          title="Employers"
          description={`Employers ${settings.legalName} recruits for. Each employer has multiple contacts and can raise multiple job requisitions.`}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CsvExportButton href="/api/export/employers" />
              {canCreateEmployer && (
                <EmployerDialog
                  appVatRegistered={settings.vatRegistered}
                  trigger={
                    <Button>
                      <Plus className="mr-1.5 size-4" /> New employer
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
            icon={Building2}
            tone="blue"
            label="Employers"
            value={employers.length}
            hint="In this view"
          />
          <StatTile
            icon={Handshake}
            tone="green"
            label="Active"
            value={activeCount}
            hint="Currently recruiting with us"
          />
          <StatTile
            icon={CircleDot}
            tone="amber"
            label="Prospects"
            value={prospectCount}
            hint="Not yet signed"
          />
          <StatTile
            icon={UserX}
            tone="rose"
            label="Unassigned"
            value={unassignedCount}
            hint="Need an owner"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <ScopeFilter current={scope} />
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <DateRangeFilter className="min-w-0 max-w-full" />
            <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="table" />
          </div>
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search employers by name, industry, location…"
            selects={[
              {
                param: 'industry',
                label: 'Industry',
                options: [{ value: '', label: 'All industries' }, ...industryOptions],
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

      {scope === 'mine' && employers.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="employers" seeAllHref="/employers?assigned=all" />
        </FadeUp>
      )}

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Employer status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count: filtered.filter((e) => t.match(e.relationshipStatus)).length,
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
                icon={Building2}
                title={
                  employers.length === 0 ? 'No employers yet' : 'No employers match these filters'
                }
                description={
                  employers.length === 0
                    ? 'Add the companies you recruit for.'
                    : 'Clear the filters or pick another status tab.'
                }
              />
            </div>
          ) : cardView ? (
            <EntityCardGrid>
              {pageData.items.map((e) => (
                <EmployerCard
                  key={e.id}
                  employer={e}
                  stats={stats.get(e.id)}
                  ownerName={e.assignedUserId ? (ownerName.get(e.assignedUserId) ?? null) : null}
                />
              ))}
            </EntityCardGrid>
          ) : (
            <EmployersTable
              employers={pageData.items}
              appVatRegistered={settings.vatRegistered}
              owners={owners}
              canEdit={canEditEmployer}
            />
          )}
          <Pagination
            basePath="/employers"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="employers"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}

function sortEmployers(rows: Employer[], sort: string | undefined): Employer[] {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => a.legalName.localeCompare(b.legalName));
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
