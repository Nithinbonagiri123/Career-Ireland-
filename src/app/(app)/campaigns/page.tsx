import { CheckCircle2, Megaphone, Plus, Sparkles, Users } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EntityCardGrid } from '@/components/ds/entity-card';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import type { CampaignStatus } from '@/modules/campaigns/labels';
import {
  type CampaignListRow,
  fetchCampaigns,
  fetchJobsForCampaignPicker,
} from '@/modules/campaigns/service';
import { CampaignCard } from './campaign-card';
import { CampaignFormDialog } from './campaign-dialog';
import { CampaignsTable } from './campaigns-table';

export const dynamic = 'force-dynamic';

type SP = {
  created?: string;
  from?: string;
  to?: string;
  requisitionId?: string;
  view?: string;
  status?: string;
  q?: string;
  link?: string;
  employer?: string;
  sort?: string;
  page?: string;
  per?: string;
};

const is =
  (...s: CampaignStatus[]) =>
  (c: CampaignListRow) =>
    s.includes(c.status);

/** Status tabs. "Draft, active & paused" stays the default, as before. */
const STATUS_TABS = [
  { key: 'open', label: 'Open', match: is('DRAFT', 'ACTIVE', 'PAUSED') },
  { key: 'active', label: 'Active', tone: 'green', match: is('ACTIVE') },
  { key: 'paused', label: 'Paused', tone: 'amber', match: is('PAUSED') },
  { key: 'draft', label: 'Draft', tone: 'slate', match: is('DRAFT') },
  {
    key: 'ended',
    label: 'Completed / cancelled',
    tone: 'blue',
    match: is('COMPLETED', 'CANCELLED'),
  },
  { key: 'all', label: 'All', match: () => true },
  { key: 'archived', label: 'Archived', tone: 'slate', match: () => true },
] as const;
type TabKey = (typeof STATUS_TABS)[number]['key'];

const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'prospects', label: 'Most prospects' },
];
const PER_OPTIONS = [12, 24, 48];

/**
 * Stage 6G — Recruitment campaigns list (approved mockups 01 / 03): header
 * with the primary action only, KPI tiles, date / view row, filter
 * toolbar, status tabs + sort, table (default) or campaign cards,
 * pagination. All filters are URL params; `?view=<status>` bookmarks from
 * before the redesign still open the right tab.
 */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'campaigns', 'view');
  const sp = await searchParams;
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  // Legacy `?view=active|paused|…` (status) links keep working.
  const legacyStatus = STATUS_TABS.some((t) => t.key === sp.view) ? sp.view : undefined;
  const tabKey: TabKey = (STATUS_TABS.find((t) => t.key === (sp.status ?? legacyStatus))?.key ??
    'open') as TabKey;
  const cardView = sp.view === 'grid';

  const [live, archivedRows, canCreate] = await Promise.all([
    fetchCampaigns(createdRange),
    fetchCampaigns(createdRange, { archived: true }),
    checkPermission('recruitment', 'campaigns', 'create'),
  ]);

  // "Start a campaign" from a job: open the dialog with that job chosen.
  // A job that cannot be advertised (draft, filled, closed, archived) is
  // not preselected; the dialog still opens and says why.
  let prefillJob = null;
  let prefillNotice: string | null = null;
  if (sp.requisitionId && canCreate) {
    const jobs = await fetchJobsForCampaignPicker();
    prefillJob = jobs.find((j) => j.id === sp.requisitionId) ?? null;
    if (!prefillJob) {
      prefillNotice =
        'That job can’t be advertised yet — only open jobs can (not draft, filled, closed or archived). Open the job first, or choose another one below.';
    }
  }

  // ── KPI tiles (live campaigns in the date range).
  const activeCount = live.filter((c) => c.status === 'ACTIVE').length;
  const runningAds = live.reduce((n, c) => n + c.activeAdCount, 0);
  const prospects = live.reduce((n, c) => n + c.prospectCount, 0);
  const converted = live.reduce((n, c) => n + c.convertedCount, 0);

  // ── Search + selects, then status tab, sort, page.
  const q = (sp.q ?? '').trim().toLowerCase();
  const matches = (c: CampaignListRow) =>
    (!q ||
      [c.name, c.requisitionTitle ?? '', c.employerName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q)) &&
    (!sp.link || (sp.link === 'job' ? Boolean(c.jobRequisitionId) : !c.jobRequisitionId)) &&
    (!sp.employer || c.employerId === sp.employer);
  const filteredLive = live.filter(matches);
  const filteredArchived = archivedRows.filter(matches);
  const tab = STATUS_TABS.find((t) => t.key === tabKey) ?? STATUS_TABS[0];
  const tabbed =
    tab.key === 'archived' ? filteredArchived : filteredLive.filter((c) => tab.match(c));
  const pageData = paginate(sortCampaigns(tabbed, sp.sort), sp.page, sp.per, PER_OPTIONS);

  const employerOptions = Array.from(
    new Map(
      [...live, ...archivedRows]
        .filter((c) => c.employerId)
        .map((c) => [c.employerId as string, c.employerName ?? 'Employer']),
    ),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));

  const noneAtAll = live.length === 0 && archivedRows.length === 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          iconTone="pink"
          title="Recruitment campaigns"
          description="Advertising for jobs the existing pool cannot fill, or to grow the talent pool. Each campaign runs one advertisement per country or job board."
          action={
            canCreate ? (
              <CampaignFormDialog
                prefillJob={prefillJob}
                prefillNotice={prefillNotice}
                defaultOpen={Boolean(prefillJob || prefillNotice)}
                trigger={
                  <Button>
                    <Plus className="mr-1.5 size-4" /> New campaign
                  </Button>
                }
              />
            ) : undefined
          }
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Sparkles}
            tone="green"
            label="Active campaigns"
            value={activeCount}
            hint="Collecting prospects now"
          />
          <StatTile
            icon={Megaphone}
            tone="blue"
            label="Ads marked live"
            value={runningAds}
            hint="Across all campaigns"
          />
          <StatTile
            icon={Users}
            tone="amber"
            label="Prospects"
            value={prospects}
            hint="Responses recorded"
          />
          <StatTile
            icon={CheckCircle2}
            tone="violet"
            label="Converted"
            value={converted}
            hint="Now candidates"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <DateRangeFilter className="min-w-0 max-w-full" />
          <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="table" />
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search campaigns by name, job or employer…"
            selects={[
              {
                param: 'link',
                label: 'Linked to',
                options: [
                  { value: '', label: 'Jobs and talent pool' },
                  { value: 'job', label: 'A job' },
                  { value: 'pool', label: 'Talent pool only' },
                ],
              },
              {
                param: 'employer',
                label: 'Employer',
                options: [{ value: '', label: 'All employers' }, ...employerOptions],
              },
            ]}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Campaign status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count:
                t.key === 'archived'
                  ? filteredArchived.length
                  : filteredLive.filter((c) => t.match(c)).length,
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
                icon={Sparkles}
                title={
                  noneAtAll
                    ? 'No campaigns yet'
                    : tab.key === 'archived'
                      ? 'No archived campaigns'
                      : 'No campaigns match these filters'
                }
                description={
                  noneAtAll
                    ? 'Start a campaign when the existing talent pool cannot fill a job, or to grow the pool.'
                    : tab.key === 'archived'
                      ? 'Archived campaigns appear here and can be restored from the campaign page.'
                      : 'Clear the filters or pick another status tab.'
                }
              />
            </div>
          ) : cardView ? (
            <EntityCardGrid>
              {pageData.items.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </EntityCardGrid>
          ) : (
            <CampaignsTable campaigns={pageData.items} archivedView={tab.key === 'archived'} />
          )}
          <Pagination
            basePath="/campaigns"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="campaigns"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}

function sortCampaigns(rows: CampaignListRow[], sort: string | undefined): CampaignListRow[] {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'prospects') return copy.sort((a, b) => b.prospectCount - a.prospectCount);
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
