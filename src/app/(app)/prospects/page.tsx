import { BellRing, CheckCircle2, Sparkles, UserCheck, Users } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EntityCardGrid } from '@/components/ds/entity-card';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import type { ProspectStatus } from '@/modules/campaigns/labels';
import { ProspectStatusSchema } from '@/modules/campaigns/schemas';
import {
  fetchCampaigns,
  fetchProspectCountries,
  fetchProspects,
  type ProspectRow,
} from '@/modules/campaigns/service';
import { ProspectCard } from './prospect-card';
import { ProspectsTable } from './prospects-table';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  campaign?: string;
  country?: string;
  q?: string;
  created?: string;
  from?: string;
  to?: string;
  view?: string;
  sort?: string;
  page?: string;
  per?: string;
};

/** Tab keys are the status enum values, so `?status=NEW` links still work. */
const STATUS_TABS: Array<{
  key: 'all' | ProspectStatus;
  label: string;
  tone?: 'blue' | 'violet' | 'amber' | 'green' | 'slate';
}> = [
  { key: 'all', label: 'All' },
  { key: 'NEW', label: 'New', tone: 'blue' },
  { key: 'SCREENED', label: 'Screened', tone: 'violet' },
  { key: 'RETAINED_IN_POOL', label: 'Talent pool', tone: 'amber' },
  { key: 'CONVERTED_TO_CANDIDATE', label: 'Converted', tone: 'green' },
  { key: 'NOT_SUITABLE', label: 'Not suitable', tone: 'slate' },
];
const SORTS = [
  { value: 'recent', label: 'Recently recorded' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'followup', label: 'Follow-up date' },
];
const PER_OPTIONS = [12, 24, 48];

/**
 * Stage 6G — Prospects list (approved mockups 01 / 03): KPI tiles, date /
 * view row, filter toolbar (search, campaign, country), status tabs + sort,
 * table (default) or prospect cards, pagination. Actions stay on the
 * prospect page and the campaign's Prospects tab.
 */
export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission('recruitment', 'prospects', 'view');
  const sp = await searchParams;

  const statusParsed = ProspectStatusSchema.safeParse(sp.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const campaignId = sp.campaign && sp.campaign.length > 0 ? sp.campaign : undefined;
  const country = sp.country && sp.country.length > 0 ? sp.country : undefined;
  const q = sp.q && sp.q.trim().length > 0 ? sp.q.trim() : undefined;
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  const cardView = sp.view === 'grid';

  const [filtered, everyone, campaigns, countries] = await Promise.all([
    // Status is applied below so every tab can show its count.
    fetchProspects({ campaignId, country, q }, createdRange),
    fetchProspects({}, createdRange),
    fetchCampaigns(),
    fetchProspectCountries(),
  ]);
  const now = Date.now();

  // ── KPI tiles (all prospects in the date range).
  const toScreen = everyone.filter((p) => p.status === 'NEW').length;
  const ready = everyone.filter(
    (p) => p.status === 'SCREENED' || p.status === 'RETAINED_IN_POOL',
  ).length;
  const followUpsDue = everyone.filter(
    (p) => p.followUpDueAt && new Date(p.followUpDueAt).getTime() <= now,
  ).length;

  const tabbed = status ? filtered.filter((p) => p.status === status) : filtered;
  const pageData = paginate(sortProspects(tabbed, sp.sort), sp.page, sp.per, PER_OPTIONS);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          iconTone="yellow"
          title="Prospects"
          description="Everyone who responded to a campaign advertisement. Convert warm prospects into candidates as they clear screening."
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Users}
            tone="blue"
            label="Prospects"
            value={everyone.length}
            hint="Responses recorded"
          />
          <StatTile
            icon={UserCheck}
            tone="amber"
            label="To screen"
            value={toScreen}
            hint="New, not yet screened"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Ready to convert"
            value={ready}
            hint="Screened or in talent pool"
          />
          <StatTile
            icon={BellRing}
            tone="rose"
            label="Follow-ups due"
            value={followUpsDue}
            hint="Due today or overdue"
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
            searchPlaceholder="Search by name or email…"
            selects={[
              {
                param: 'campaign',
                label: 'Campaign',
                options: [
                  { value: '', label: 'All campaigns' },
                  ...campaigns.map((c) => ({ value: c.id, label: c.name })),
                ],
              },
              {
                param: 'country',
                label: 'Country',
                options: [
                  { value: '', label: 'All countries' },
                  ...countries.map((c) => ({ value: c, label: c })),
                ],
              },
            ]}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Filter by status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: t.tone,
              count:
                t.key === 'all'
                  ? filtered.length
                  : filtered.filter((p) => p.status === t.key).length,
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
                icon={Users}
                title={
                  everyone.length === 0 ? 'No prospects yet' : 'No prospects match these filters'
                }
                description={
                  everyone.length === 0
                    ? 'Prospects are recorded from an advertisement on a campaign’s Prospects tab.'
                    : 'Clear the filters or pick another status tab.'
                }
              />
            </div>
          ) : cardView ? (
            <EntityCardGrid>
              {pageData.items.map((p) => (
                <ProspectCard key={p.id} prospect={p} now={now} />
              ))}
            </EntityCardGrid>
          ) : (
            <ProspectsTable prospects={pageData.items} nowIso={new Date(now).toISOString()} />
          )}
          <Pagination
            basePath="/prospects"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="prospects"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}

function sortProspects(rows: ProspectRow[], sort: string | undefined): ProspectRow[] {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => a.personName.localeCompare(b.personName));
  if (sort === 'followup')
    return copy.sort(
      (a, b) =>
        (a.followUpDueAt ? new Date(a.followUpDueAt).getTime() : Number.POSITIVE_INFINITY) -
        (b.followUpDueAt ? new Date(b.followUpDueAt).getTime() : Number.POSITIVE_INFINITY),
    );
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
