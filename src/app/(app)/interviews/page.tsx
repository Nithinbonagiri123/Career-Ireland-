import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarClock,
  ExternalLink,
  Globe,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import {
  CARD_ACTION,
  CARD_ACTION_TINT,
  EntityCard,
  EntityCardGrid,
  initialsOf,
} from '@/components/ds/entity-card';
import { FilterToolbar, StatusTabs, ViewToggle } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DsStatusPill } from '@/components/ds/status-pill';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { requirePermission } from '@/lib/auth/session';
import { parseAssignmentScope } from '@/lib/scope';
import { type InterviewRow, listInterviewStageApplications } from '@/modules/interviews/service';
import { InterviewsTable } from './interviews-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Interviews' };

type SP = {
  assigned?: string;
  view?: string;
  q?: string;
  type?: string;
  employer?: string;
  sort?: string;
  page?: string;
  per?: string;
};

const TYPE_TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'internal', label: 'Our jobs', tone: 'violet', match: (r: InterviewRow) => !r.isExternal },
  { key: 'external', label: 'External', tone: 'slate', match: (r: InterviewRow) => r.isExternal },
] as const;
const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Waiting longest' },
  { value: 'name', label: 'Candidate A–Z' },
];
const PER_OPTIONS = [12, 24, 48];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stage 6G — global Interviews list: everyone currently at the Interview
 * stage of a job. Header, KPI tiles, scope / view row, filter toolbar,
 * type tabs + sort, candidate cards (default) or table, pagination.
 */
export default async function InterviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'interviews', 'view');
  const sp = await searchParams;
  const scope = parseAssignmentScope(sp.assigned);
  const cardView = sp.view !== 'table';
  const rows = await listInterviewStageApplications({ scope });

  // ── KPI tiles (current scope).
  const now = Date.now();
  const internal = rows.filter((r) => !r.isExternal).length;
  const thisWeek = rows.filter((r) => now - new Date(r.promotedAt).getTime() <= WEEK_MS).length;
  const jobs = new Set(rows.map((r) => r.requisitionId).filter(Boolean)).size;

  // ── Filters, then type tab, sort, page.
  const q = (sp.q ?? '').trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!q ||
        [
          r.candidateName,
          r.candidateEmail ?? '',
          r.requisitionTitle ?? '',
          r.employerName ?? '',
          r.externalCompanyName ?? '',
          r.externalJobTitle ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)) &&
      (!sp.employer || r.employerName === sp.employer),
  );
  const tab = TYPE_TABS.find((t) => t.key === sp.type) ?? TYPE_TABS[0];
  const sorted = sortRows(
    filtered.filter((r) => tab.match(r)),
    sp.sort,
  );
  const pageData = paginate(sorted, sp.page, sp.per, PER_OPTIONS);
  const employerOptions = Array.from(
    new Set(rows.map((r) => r.employerName).filter((v): v is string => Boolean(v))),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={CalendarClock}
          iconTone="purple"
          title="Interviews"
          description="Every candidate currently at the Interview stage of any job. The employer runs the interview; this page shows who is in that stage right now."
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={Users}
            tone="violet"
            label="At interview"
            value={rows.length}
            hint="Candidates in this stage"
          />
          <StatTile
            icon={Briefcase}
            tone="blue"
            label="Jobs interviewing"
            value={jobs}
            hint={`${internal} on our own jobs`}
          />
          <StatTile
            icon={Sparkles}
            tone="green"
            label="New this week"
            value={thisWeek}
            hint="Moved in the last 7 days"
          />
          <StatTile
            icon={Globe}
            tone="slate"
            label="External"
            value={rows.length - internal}
            hint="Applications outside our jobs"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <ScopeFilter current={scope} />
          <ViewToggle current={cardView ? 'cards' : 'table'} defaultView="cards" />
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search by candidate, job or employer…"
            selects={[
              {
                param: 'employer',
                label: 'Employer',
                options: [{ value: '', label: 'All employers' }, ...employerOptions],
              },
            ]}
          />
        </div>
      </FadeUp>

      {scope === 'mine' && rows.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="interviews" seeAllHref="/interviews?assigned=all" />
        </FadeUp>
      )}

      <FadeUp delay={0.07}>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Interview type"
            param="type"
            tabs={TYPE_TABS.map((t) => ({
              key: t.key,
              label: t.label,
              tone: 'tone' in t ? t.tone : undefined,
              count: filtered.filter((r) => t.match(r)).length,
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
                icon={CalendarClock}
                title={
                  rows.length === 0
                    ? 'Nobody at the Interview stage right now'
                    : 'No interviews match these filters'
                }
                description={
                  rows.length === 0
                    ? "When a candidate is moved into the Interview stage on a job's pipeline, they show up here."
                    : 'Clear the filters or pick another tab.'
                }
              />
            </div>
          ) : cardView ? (
            <EntityCardGrid>
              {pageData.items.map((r) => (
                <InterviewCard key={r.applicationId} r={r} />
              ))}
            </EntityCardGrid>
          ) : (
            <>
              {/* Phones get cards even in table view. */}
              <div className="hidden md:block">
                <InterviewsTable rows={pageData.items} />
              </div>
              <div className="md:hidden">
                <EntityCardGrid>
                  {pageData.items.map((r) => (
                    <InterviewCard key={r.applicationId} r={r} />
                  ))}
                </EntityCardGrid>
              </div>
            </>
          )}
          <Pagination
            basePath="/interviews"
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

function InterviewCard({ r }: { r: InterviewRow }) {
  const moved = new Date(r.promotedAt);
  const jobLabel = r.isExternal
    ? (r.externalJobTitle ?? r.externalCompanyName ?? 'External application')
    : r.requisitionTitle;
  const jobHref = r.requisitionId ? `/requisitions/${r.requisitionId}?tab=interviews` : null;
  return (
    <EntityCard
      testId="interview-card"
      avatar={{ initials: initialsOf(r.candidateName), tone: r.isExternal ? 'slate' : 'violet' }}
      status={
        r.isExternal ? (
          <DsStatusPill tone="slate">External</DsStatusPill>
        ) : (
          <DsStatusPill tone="violet">Interview</DsStatusPill>
        )
      }
      timestamp={
        <time dateTime={moved.toISOString()} title={format(moved, 'd MMM yyyy · HH:mm')}>
          {formatDistanceToNowStrict(moved, { addSuffix: true })}
        </time>
      }
      title={r.candidateName}
      titleHref={`/candidates/${r.candidatePersonId}`}
      subtitle={r.candidateEmail ?? undefined}
      meta={[
        {
          key: 'job',
          icon: r.isExternal ? ExternalLink : Briefcase,
          content: jobLabel ?? null,
        },
        {
          key: 'employer',
          icon: Building2,
          content: r.employerName ?? (r.isExternal ? r.externalCompanyName : null),
        },
        {
          key: 'moved',
          icon: CalendarClock,
          content: `Moved to Interview ${format(moved, 'd MMM yyyy · HH:mm')}`,
        },
      ]}
      actions={
        <>
          <Link
            href={`/candidates/${r.candidatePersonId}`}
            className={jobHref ? CARD_ACTION : `${CARD_ACTION} col-span-2`}
          >
            Candidate <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          {jobHref && (
            <Link href={jobHref} className={CARD_ACTION_TINT}>
              <CalendarClock className="size-3.5" aria-hidden /> Interviews
            </Link>
          )}
        </>
      }
    />
  );
}

function sortRows(rows: InterviewRow[], sort: string | undefined): InterviewRow[] {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => a.candidateName.localeCompare(b.candidateName));
  const t = (r: InterviewRow) => new Date(r.promotedAt).getTime();
  if (sort === 'oldest') return copy.sort((a, b) => t(a) - t(b));
  return copy.sort((a, b) => t(b) - t(a));
}
