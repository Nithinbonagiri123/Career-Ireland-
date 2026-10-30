import { CheckCircle2, Clock, Coins, PlayCircle } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FilterToolbar, StatusTabs } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import type { EngagementListRow } from '@/modules/commerce/repository';
import { fetchEngagements } from '@/modules/commerce/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchServiceCatalog } from '@/modules/services-catalog/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { CreateEngagementDialog } from './create-engagement-dialog';
import { EngagementsTable } from './engagements-table';

export const dynamic = 'force-dynamic';

type SP = {
  created?: string;
  from?: string;
  to?: string;
  q?: string;
  status?: string;
  service?: string;
  payer?: string;
  sort?: string;
  page?: string;
  per?: string;
};

type Status = EngagementListRow['status'];
const STATUS_TABS: Array<{
  key: string;
  label: string;
  tone?: 'blue' | 'amber' | 'green' | 'violet' | 'slate' | 'rose';
  match: (s: Status) => boolean;
}> = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'requested', label: 'Requested', tone: 'slate', match: (s) => s === 'REQUESTED' },
  {
    key: 'awaiting',
    label: 'Awaiting payment',
    tone: 'amber',
    match: (s) => s === 'PENDING_PAYMENT',
  },
  { key: 'active', label: 'Active', tone: 'blue', match: (s) => s === 'ACTIVE' },
  { key: 'on_hold', label: 'On hold', tone: 'violet', match: (s) => s === 'ON_HOLD' },
  { key: 'completed', label: 'Completed', tone: 'green', match: (s) => s === 'COMPLETED' },
  { key: 'cancelled', label: 'Cancelled', tone: 'rose', match: (s) => s === 'CANCELLED' },
];
const SORTS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'amount', label: 'Highest amount' },
  { value: 'service', label: 'Service A–Z' },
];
const PER_OPTIONS = [25, 50, 100];

/**
 * Stage 6G — Services list (the DB term is "engagement"). Same pattern as
 * the Recruitment lists: header with the primary action, summary tiles,
 * date row, filter bar, status tabs + sort, table, pagination. All filters
 * live in the URL; the table receives the already filtered page of rows.
 */
// `readMulti` from the kit is a client export and can't run in this server
// component, so the comma-separated param is parsed here the same way.
export default async function EngagementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('candidate_services', 'engagements', 'view');
  const sp = await searchParams;
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  const [engagements, services, currencies, persons, employers, settings] = await Promise.all([
    fetchEngagements(createdRange),
    fetchServiceCatalog(),
    fetchCurrencies(),
    fetchPersons(),
    fetchEmployers('all'),
    fetchAppSettings(),
  ]);

  const count = (pred: (s: Status) => boolean) => engagements.filter((e) => pred(e.status)).length;

  const q = (sp.q ?? '').trim().toLowerCase();
  const serviceFilter = (sp.service ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const filtered = engagements.filter(
    (e) =>
      (!q ||
        [e.serviceName, e.payerLabel, e.beneficiaryName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q)) &&
      (serviceFilter.length === 0 || serviceFilter.includes(e.serviceName)) &&
      (!sp.payer ||
        (sp.payer === 'person' ? Boolean(e.payerPersonId) : Boolean(e.payerEmployerId))),
  );
  const tab = STATUS_TABS.find((t) => t.key === sp.status) ?? STATUS_TABS[0];
  const tabbed = filtered.filter((e) => tab.match(e.status));
  const sorted = [...tabbed].sort((a, b) => {
    if (sp.sort === 'amount')
      return Number.parseFloat(b.agreedAmount) - Number.parseFloat(a.agreedAmount);
    if (sp.sort === 'service') return a.serviceName.localeCompare(b.serviceName);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const pageData = paginate(sorted, sp.page, sp.per, PER_OPTIONS);
  const serviceOptions = Array.from(new Set(engagements.map((e) => e.serviceName)))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Coins}
          iconTone="green"
          title="Services"
          description={`Services ${settings.legalName} is delivering, with the money tied to each. Start a service here, then record payments against it as they land.`}
          action={
            <CreateEngagementDialog
              services={services}
              currencies={currencies}
              persons={persons}
              employers={employers}
            />
          }
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Coins}
            tone="blue"
            label="Services"
            value={engagements.length}
            hint="In this date range"
          />
          <StatTile
            icon={Clock}
            tone="amber"
            label="Awaiting payment"
            value={count((s) => s === 'PENDING_PAYMENT')}
            hint={`${count((s) => s === 'REQUESTED')} requested`}
          />
          <StatTile
            icon={PlayCircle}
            tone="violet"
            label="Active"
            value={count((s) => s === 'ACTIVE')}
            hint="Being delivered now"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Completed"
            value={count((s) => s === 'COMPLETED')}
            hint="Delivered"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <DateRangeFilter className="min-w-0 max-w-full" />
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search by service, payer or beneficiary…"
            selects={[
              {
                param: 'service',
                label: 'Service',
                multiple: true,
                options: [{ value: '', label: 'All services' }, ...serviceOptions],
              },
              {
                param: 'payer',
                label: 'Payer',
                options: [
                  { value: '', label: 'Candidates and employers' },
                  { value: 'person', label: 'Candidates' },
                  { value: 'employer', label: 'Employers' },
                ],
              },
            ]}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Service status"
            tabs={STATUS_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: t.tone,
              count: filtered.filter((e) => t.match(e.status)).length,
            }))}
            sort={SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="mt-4">
          {pageData.total === 0 && engagements.length > 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
              <EmptyState
                icon={Coins}
                title="No services match these filters"
                description="Clear the filters or pick another status tab."
              />
            </div>
          ) : (
            <EngagementsTable engagements={pageData.items} />
          )}
          <Pagination
            basePath="/engagements"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="services"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}
