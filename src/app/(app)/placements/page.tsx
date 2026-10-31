import { CircleCheckBig, Hourglass, ReceiptText, Trophy } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { canFinance } from '@/lib/auth/finance-policy';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { isPlacementFeeRaisable } from '@/modules/placements/fee';
import { fetchPlacements, type PlacementListRow } from '@/modules/placements/service';
import { PlacementsList } from './placements-table';

export const dynamic = 'force-dynamic';

type SP = {
  created?: string;
  from?: string;
  to?: string;
  view?: string;
  q?: string;
  status?: string;
  employer?: string;
  invoice?: string;
  sort?: string;
  page?: string;
  per?: string;
};

const STATUS_TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'proposed', label: 'Proposed', tone: 'blue', match: (s: string) => s === 'PROPOSED' },
  { key: 'confirmed', label: 'Confirmed', tone: 'green', match: (s: string) => s === 'CONFIRMED' },
  { key: 'started', label: 'Started', tone: 'blue', match: (s: string) => s === 'STARTED' },
  { key: 'completed', label: 'Completed', tone: 'green', match: (s: string) => s === 'COMPLETED' },
  {
    key: 'terminated',
    label: 'Terminated early',
    tone: 'rose',
    match: (s: string) => s === 'TERMINATED_EARLY',
  },
] as const;
const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'start', label: 'Start date' },
  { value: 'name', label: 'Candidate A–Z' },
];
const PER_OPTIONS = [12, 24, 48];

function invoiceState(p: PlacementListRow): 'none' | 'outstanding' | 'paid' | 'voided' {
  const inv = p.latestInvoice;
  if (!inv) return 'none';
  if (inv.status === 'PAID') return 'paid';
  if (inv.status === 'VOIDED') return 'voided';
  return 'outstanding';
}

/** P0 — "Not invoiced" means a fee is actually due to be raised: a
 *  confirmed / started / completed placement with no non-void invoice. */
function awaitingFee(p: PlacementListRow): boolean {
  return isPlacementFeeRaisable(p);
}

/**
 * Stage 6G — Placements list (approved mockups 01 / 03 language): header,
 * KPI tiles, date / view row, filter toolbar, status tabs + sort, table
 * (default) or placement cards, pagination. All filters are URL params.
 */
export default async function PlacementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'placements', 'view');
  const sp = await searchParams;
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  // Table stays the default; `view=grid` opts into cards.
  const cardView = sp.view === 'grid';
  const [placements, canEdit, canIssueInvoice] = await Promise.all([
    fetchPlacements(createdRange),
    // R6 — status / restore / archive need recruitment.placements edit.
    checkPermission('recruitment', 'placements', 'edit'),
    // P0 — only finance authority may issue the fee invoice (server rule).
    canFinance('ISSUE'),
  ]);

  // ── KPI tiles (current date range).
  const active = placements.filter((p) => p.status === 'CONFIRMED' || p.status === 'STARTED');
  const completed = placements.filter((p) => p.status === 'COMPLETED').length;
  const notInvoiced = placements.filter(awaitingFee).length;

  // ── Filters, then status tab, sort, page.
  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = placements.filter(
    (p) =>
      (!q ||
        [p.personName, p.employerName, p.requisitionTitle, p.latestInvoice?.number ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)) &&
      (!sp.employer || p.employerId === sp.employer) &&
      (!sp.invoice || (sp.invoice === 'none' ? awaitingFee(p) : invoiceState(p) === sp.invoice)),
  );
  const tab = STATUS_TABS.find((t) => t.key === sp.status) ?? STATUS_TABS[0];
  const sorted = sortPlacements(
    filtered.filter((p) => tab.match(p.status)),
    sp.sort,
  );
  const pageData = paginate(sorted, sp.page, sp.per, PER_OPTIONS);

  const employerOptions = Array.from(new Map(placements.map((p) => [p.employerId, p.employerName])))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Trophy}
          iconTone="green"
          title="Placements"
          description="Successful candidate and employer outcomes. Marking Placed on a requisition's pipeline creates the placement here, sets the candidate to Placed and advances the requisition's fill count."
          action={<CsvExportButton href="/api/export/placements" />}
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Trophy}
            tone="blue"
            label="Placements"
            value={placements.length}
            hint="In this date range"
          />
          <StatTile
            icon={Hourglass}
            tone="violet"
            label="Active"
            value={active.length}
            hint="Confirmed or started"
          />
          <StatTile
            icon={CircleCheckBig}
            tone="green"
            label="Completed"
            value={completed}
            hint="Finished successfully"
          />
          <StatTile
            icon={ReceiptText}
            tone="amber"
            label="Not invoiced"
            value={notInvoiced}
            hint="Confirmed, no live fee invoice"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <DateRangeFilter className="min-w-0 max-w-full" />
          <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="table" />
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search by candidate, employer, job or invoice…"
            selects={[
              {
                param: 'employer',
                label: 'Employer',
                options: [{ value: '', label: 'All employers' }, ...employerOptions],
              },
              {
                param: 'invoice',
                label: 'Fee invoice',
                options: [
                  { value: '', label: 'Any' },
                  { value: 'none', label: 'Not invoiced' },
                  { value: 'outstanding', label: 'Awaiting payment' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'voided', label: 'Voided' },
                ],
              },
            ]}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Placement status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count: filtered.filter((p) => t.match(p.status)).length,
            }))}
            sort={SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="mt-4">
          <PlacementsList
            placements={pageData.items}
            view={cardView ? 'cards' : 'table'}
            canEdit={canEdit}
            canIssueInvoice={canIssueInvoice}
            filtered={placements.length > 0}
          />
          <Pagination
            basePath="/placements"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="placements"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}

function sortPlacements(rows: PlacementListRow[], sort: string | undefined): PlacementListRow[] {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => a.personName.localeCompare(b.personName));
  if (sort === 'start')
    return copy.sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'));
  return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
