import { CalendarClock, CheckCircle2, Globe, PlaneTakeoff, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { CsvExportButton } from '@/components/csv-export-button';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import { resolveRaiseCasePrefill } from '@/modules/immigration/raise-prefill';
import { fetchCases } from '@/modules/immigration/service';
import { fetchPersons } from '@/modules/persons/service';
import { CasesCardGrid } from './case-card';
import { CaseDialog, type CaseDialogPrefill } from './case-dialog';
import {
  CASE_SORTS,
  type CaseListParams,
  filterCases,
  matchesStage,
  STAGE_TABS,
  sortCases,
  stageOf,
} from './case-filters';
import { CaseScopeTray } from './case-scope-tray';
import { CasesTable } from './cases-table';

export const dynamic = 'force-dynamic';

const PER_OPTIONS = [12, 24, 48];

type SP = CaseListParams & {
  assigned?: string;
  view?: string;
  page?: string;
  per?: string;
  raisePerson?: string;
  raisePlacement?: string;
  raiseRequisition?: string;
};

/**
 * Stage 6G — Immigration cases list (same pattern as the Recruitment and
 * Candidate Services lists): header with primary actions, KPI tiles, scope /
 * view row, filter bar, stage tabs with counts + sort, cards or table, and
 * pagination. Every filter is a URL param; cards and table render the same
 * filtered, sorted page.
 */
export default async function ImmigrationPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('immigration', 'cases', 'view');
  const session = await requireInternalStaff();
  const sp = await searchParams;
  const scope = parseAssignmentScope(sp.assigned);

  // Deep-link support: /immigration?raisePlacement=X (or raisePerson /
  // raiseRequisition) pre-fills the Open-case dialog and pops it on mount.
  const raisePrefill: CaseDialogPrefill | undefined = await resolveRaiseCasePrefill({
    personId: sp.raisePerson,
    placementId: sp.raisePlacement,
    requisitionId: sp.raiseRequisition,
  });
  // Cards are the default (spec §11: owner + candidate at a glance); the
  // table is the drill-down view.
  const cardView = sp.view !== 'table';
  const [cases, persons, employers, applicationTypes] = await Promise.all([
    fetchCases(scope),
    fetchPersons(),
    fetchEmployers(),
    fetchApplicationTypes(),
  ]);

  // ── KPI tiles over the current scope.
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const inProgress = cases.filter(
    (c) => c.status === 'SUBMITTED' || c.status === 'UNDER_AUTHORITY_REVIEW',
  ).length;
  const approved = cases.filter((c) => c.status === 'APPROVED').length;
  const expiringSoon = cases.filter(
    (c) => c.expiresOn && c.expiresOn >= today && c.expiresOn <= in60,
  ).length;
  const mineCount = cases.filter((c) => c.assignedUserId === session.user.id).length;

  // ── Filters → stage tab → sort → page (one pipeline for both views).
  const filtered = filterCases(cases, sp);
  const stage = stageOf(sp.stage);
  const staged = filtered.filter((c) => matchesStage(c, stage.key));
  const pageData = paginate(sortCases(staged, sp.sort), sp.page, sp.per, PER_OPTIONS);

  // Filter options come from the cases in scope so every choice can match.
  const appTypeOptions = Array.from(
    new Map(
      cases
        .filter((c) => c.applicationTypeId && c.applicationTypeName)
        .map((c) => [c.applicationTypeId as string, c.applicationTypeName as string]),
    ),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
  const sponsorOptions = Array.from(
    new Map(
      cases
        .filter((c) => c.sponsorEmployerId && c.sponsorName)
        .map((c) => [c.sponsorEmployerId as string, c.sponsorName as string]),
    ),
  )
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([value, label]) => ({ value, label }));
  const ownerOptions = Array.from(
    new Map(
      cases
        .filter((c) => c.assignedUserId && c.ownerName)
        .map((c) => [c.assignedUserId as string, c.ownerName as string]),
    ),
  ).map(([value, label]) => ({ value, label }));

  const emptyMine = scope === 'mine' && cases.length === 0;
  // Page links keep the list params but never the one-shot "raise case"
  // deep-link params (they would re-open the dialog on every page change).
  const { raisePerson: _rp, raisePlacement: _rpl, raiseRequisition: _rr, ...listParams } = sp;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={PlaneTakeoff}
          iconTone="pink"
          title="Immigration cases"
          description="Employment Permits, Visas, and Visa Extensions. Independent of placements — can run for any employer / person combination."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CsvExportButton href="/api/export/immigration" />
              <CaseDialog
                persons={persons}
                employers={employers}
                applicationTypes={applicationTypes}
                prefill={raisePrefill}
                defaultOpen={Boolean(raisePrefill)}
                trigger={
                  <Button>
                    <Plus className="mr-1.5 size-4" /> Open case
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={PlaneTakeoff}
            tone="blue"
            label="Cases"
            value={cases.length}
            hint={scope === 'mine' ? 'Assigned to you' : `${mineCount} assigned to you`}
          />
          <StatTile
            icon={Send}
            tone="violet"
            label="Application in progress"
            value={inProgress}
            hint="Submitted or under review"
          />
          <StatTile
            icon={CheckCircle2}
            tone="green"
            label="Approved"
            value={approved}
            hint="Decision received"
          />
          <StatTile
            icon={CalendarClock}
            tone="amber"
            label="Expiring in 60 days"
            value={expiringSoon}
            hint="Renewals to plan"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <CaseScopeTray current={scope} />
          <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="cards" />
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search name, sponsor, ref…"
            selects={[
              {
                param: 'type',
                label: 'Case type',
                multiple: true,
                options: [
                  { value: '', label: 'All case types' },
                  ...Object.entries(CASE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
                ],
              },
              {
                param: 'apptype',
                label: 'Application type',
                multiple: true,
                options: [{ value: '', label: 'All types' }, ...appTypeOptions],
              },
              {
                param: 'sponsor',
                label: 'Sponsor',
                multiple: true,
                secondary: true,
                options: [
                  { value: '', label: 'All sponsors' },
                  { value: 'none', label: 'No sponsor' },
                  ...sponsorOptions,
                ],
              },
              {
                param: 'owner',
                label: 'Owner',
                secondary: true,
                options: [
                  { value: '', label: 'All owners' },
                  { value: 'none', label: 'Unassigned' },
                  ...ownerOptions,
                ],
              },
              {
                param: 'expiring',
                label: 'Expiry',
                secondary: true,
                options: [
                  { value: '', label: 'Any expiry' },
                  { value: '60', label: 'Expiring in 60 days' },
                  { value: 'expired', label: 'Already expired' },
                ],
              },
            ]}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Case stage"
            param="stage"
            tabs={STAGE_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count: filtered.filter((c) => matchesStage(c, t.key)).length,
            }))}
            sort={CASE_SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.09}>
        <div className="mt-4">
          {pageData.total === 0 ? (
            // One boxed message (was the "mine" nudge plus a second empty state).
            <div
              data-testid="immigration-empty"
              className="rounded-2xl border border-border/60 bg-card shadow-sm"
            >
              <EmptyState
                icon={PlaneTakeoff}
                title={
                  cases.length === 0 ? 'No immigration cases yet' : 'No cases match these filters'
                }
                description={
                  emptyMine
                    ? 'Nothing is assigned to you yet. Switch to Global Cases to see everyone’s work, or click "Open case" to record one.'
                    : cases.length === 0
                      ? 'Employment Permits, Visas, and Visa Extensions all live here. Click "Open case" above to record the first one.'
                      : 'Clear the filters or pick another stage tab.'
                }
                action={
                  emptyMine ? (
                    <Link
                      href="/immigration?assigned=all"
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    >
                      <Globe className="mr-1.5 size-3.5" aria-hidden /> See Global Cases
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : cardView ? (
            <CasesCardGrid cases={pageData.items} />
          ) : (
            <>
              {/* Phones get cards in table view too: the table needs more width. */}
              <div className="hidden md:block">
                <CasesTable cases={pageData.items} />
              </div>
              <div className="md:hidden">
                <CasesCardGrid cases={pageData.items} />
              </div>
            </>
          )}
          <Pagination
            basePath="/immigration"
            params={listParams}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="cases"
            perOptions={PER_OPTIONS}
          />
        </div>
      </FadeUp>
    </div>
  );
}
