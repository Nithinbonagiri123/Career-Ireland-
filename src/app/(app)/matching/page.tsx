import {
  Briefcase,
  Building2,
  ChevronRight,
  CircleCheck,
  Clock,
  EyeOff,
  Hand,
  ListChecks,
  SearchCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { FilterToolbar, StatusTabs } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { FOCUS_RING } from '@/components/ds/segmented';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DsEnumPill, DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Timestamp } from '@/components/timestamp';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import {
  AVAILABILITY_LABEL,
  BUCKET_LABEL,
  MATCH_STATUS_LABEL,
  ORIGIN_LABEL,
} from '@/modules/matching/labels';
import { MatchFiltersSchema } from '@/modules/matching/schemas';
import {
  countGlobalMatches,
  fetchGlobalMatches,
  fetchMatchingJobOptions,
  GLOBAL_LIST_LIMIT,
  type GlobalMatchRow,
} from '@/modules/matching/workspace';
import { MatchRowActions, RunMatchingPanel } from './match-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matching' };

type SP = Record<string, string | undefined>;

/** Score strength → Stage 6G tone for the score tile. */
const BUCKET_DS_TONE: Record<GlobalMatchRow['scoreBucket'], DsTone> = {
  HIGH: 'green',
  MEDIUM: 'amber',
  LOW: 'slate',
};

const SORTS = [
  { value: 'score', label: 'Strongest first' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'name', label: 'Name A–Z' },
];
const PER_OPTIONS = [20, 50, 100];

/**
 * R5 — global Matching workspace: every job's matches in one ranked list,
 * filterable by job, strength, origin, status and availability, with links
 * to the candidate and the job. Confirmed-placed and explicitly
 * unavailable candidates are hidden by default (the count is shown).
 *
 * Stage 6G — page header, KPI tiles, Run matching card, filter toolbar,
 * status tabs with counts + sort, match rows, pagination. URL params are
 * unchanged (`job`, `q`, `status`, `bucket`, `origin`, `availability`,
 * `jobs`), so links such as /matching?job=<id> keep working.
 */
export default async function MatchingPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'matching', 'view');
  const sp = await searchParams;
  const parsed = MatchFiltersSchema.safeParse({
    q: sp.q || undefined,
    requisitionId: sp.job || undefined,
    status: sp.status || undefined,
    bucket: sp.bucket || undefined,
    origin: sp.origin || undefined,
    availability: sp.availability || undefined,
    jobs: sp.jobs || undefined,
  });
  const f = parsed.success ? parsed.data : {};
  const [result, counts, jobs, canEdit] = await Promise.all([
    fetchGlobalMatches(f),
    countGlobalMatches(f),
    fetchMatchingJobOptions(),
    checkPermission('recruitment', 'matching', 'edit'),
  ]);
  const status = f.status ?? 'open';
  const openJobs = jobs.filter((j) => j.open);
  const pageData = paginate(sortMatches(result.rows, sp.sort), sp.page, sp.per, PER_OPTIONS);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={SearchCheck}
          iconTone="purple"
          title="Matching"
          description="Candidate matches across all jobs, strongest first. Shortlist or dismiss here, or open the job to work its pipeline."
        />
      </FadeUp>

      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={ListChecks}
            tone="blue"
            label="To review"
            value={counts.open}
            hint="Suggested or reviewed"
          />
          <StatTile
            icon={Sparkles}
            tone="green"
            label="Strong matches"
            value={counts.openStrong}
            hint="Waiting for review"
          />
          <StatTile
            icon={CircleCheck}
            tone="violet"
            label="Shortlisted"
            value={counts.shortlisted}
            hint="Moved to shortlists"
          />
          <StatTile
            icon={EyeOff}
            tone="amber"
            label="Hidden"
            value={result.hiddenUnavailable}
            hint="Placed or unavailable"
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        {canEdit && (
          <div className="mt-6">
            <RunMatchingPanel jobs={openJobs} defaultJobId={f.requisitionId} />
          </div>
        )}
        <div className="mt-4">
          <FilterToolbar
            searchPlaceholder="Name or email…"
            selects={[
              {
                param: 'job',
                label: 'Job',
                options: [
                  { value: '', label: 'All jobs' },
                  ...jobs.map((j) => ({
                    value: j.id,
                    label: `${j.title} — ${j.employerName}${j.open ? '' : ' (closed)'}`,
                  })),
                ],
              },
              {
                param: 'bucket',
                label: 'Strength',
                options: [
                  { value: '', label: 'Any strength' },
                  { value: 'HIGH', label: 'Strong' },
                  { value: 'MEDIUM', label: 'Fair' },
                  { value: 'LOW', label: 'Weak' },
                ],
              },
              {
                param: 'origin',
                secondary: true,
                label: 'Origin',
                options: [
                  { value: '', label: 'Any origin' },
                  { value: 'ASSISTED', label: 'Assisted' },
                  { value: 'MANUAL', label: 'Added by hand' },
                ],
              },
              {
                param: 'availability',
                secondary: true,
                label: 'Availability',
                options: [
                  { value: '', label: 'Available only' },
                  { value: 'all', label: 'Include placed / unavailable' },
                ],
              },
              {
                param: 'jobs',
                secondary: true,
                label: 'Jobs',
                options: [
                  { value: '', label: 'Open jobs' },
                  { value: 'all', label: 'Include closed jobs' },
                ],
              },
            ]}
          />
        </div>
        <div className="mt-4">
          <StatusTabs
            ariaLabel="Match status"
            tabs={[
              { key: 'open', label: 'To review', count: counts.open, tone: 'blue' },
              {
                key: 'shortlisted',
                label: 'Shortlisted',
                count: counts.shortlisted,
                tone: 'green',
              },
              { key: 'dismissed', label: 'Dismissed', count: counts.dismissed, tone: 'slate' },
              { key: 'all', label: 'All', count: counts.all },
            ]}
            sort={SORTS}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          {result.hiddenUnavailable > 0 && (
            <p
              className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground"
              data-testid="hidden-unavailable"
            >
              <EyeOff className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                {result.hiddenUnavailable} placed or unavailable candidate
                {result.hiddenUnavailable === 1 ? '' : 's'} hidden — choose “Include placed /
                unavailable” to see them.
              </span>
            </p>
          )}
          {pageData.total === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
              <EmptyState
                icon={SearchCheck}
                title="No matches here"
                description={
                  status === 'open'
                    ? 'Run matching for a job, or change the filters.'
                    : 'No matches match these filters.'
                }
              />
            </div>
          ) : (
            <ul
              className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
              data-testid="match-rows"
            >
              {pageData.items.map((m) => (
                <MatchRow key={m.id} m={m} canEdit={canEdit} />
              ))}
            </ul>
          )}
          <Pagination
            basePath="/matching"
            params={sp}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="matches"
            perOptions={PER_OPTIONS}
          />
          {result.capped && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the first {GLOBAL_LIST_LIMIT}. Narrow the filters to see more.
            </p>
          )}
          {!canEdit && (
            <p className="mt-3 text-xs text-muted-foreground" data-testid="matching-read-only">
              View only — your role cannot run matching or change shortlists.
            </p>
          )}
        </div>
      </FadeUp>
    </div>
  );
}

function MatchRow({ m, canEdit }: { m: GlobalMatchRow; canEdit: boolean }) {
  const jobOpen = m.requisitionStatus !== 'CLOSED' && m.requisitionStatus !== 'CANCELLED';
  const unavailable =
    m.confirmedPlaced ||
    m.availabilityStatus === 'PLACED' ||
    m.availabilityStatus === 'TEMPORARILY_UNAVAILABLE';
  const actionable = canEdit && jobOpen && (m.status === 'SUGGESTED' || m.status === 'REVIEWED');
  const tone = BUCKET_DS_TONE[m.scoreBucket];
  return (
    <li className="px-4 py-4 sm:px-5" data-match-status={m.status}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-xl text-center leading-none',
              DS_SOFT[tone],
            )}
            title={`${BUCKET_LABEL[m.scoreBucket]} match`}
          >
            <span>
              <span className="block text-base font-semibold tabular-nums">{m.score}</span>
              <span className="mt-0.5 block text-[9.5px] font-medium uppercase tracking-wide">
                {BUCKET_LABEL[m.scoreBucket]}
              </span>
            </span>
            <span className="sr-only">
              {' '}
              points, {BUCKET_LABEL[m.scoreBucket].toLowerCase()} match
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/candidates/${m.personId}`}
                className={cn(
                  'truncate rounded-sm text-[15px] font-semibold text-foreground hover:underline',
                  FOCUS_RING,
                )}
              >
                {m.personName}
              </Link>
              <DsEnumPill status={m.status} label={MATCH_STATUS_LABEL[m.status]} />
              {unavailable && (
                <DsStatusPill tone="amber">
                  {m.confirmedPlaced
                    ? 'Placed'
                    : (AVAILABILITY_LABEL[m.availabilityStatus ?? ''] ?? 'Unavailable')}
                </DsStatusPill>
              )}
            </div>
            <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/80">
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <Briefcase className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                <Link
                  href={`/requisitions/${m.requisitionId}`}
                  className={cn('truncate rounded-sm hover:underline', FOCUS_RING)}
                >
                  {m.requisitionTitle}
                </Link>
                {!jobOpen && <span className="text-muted-foreground">· job closed</span>}
              </li>
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                <Link
                  href={`/employers/${m.employerId}`}
                  className={cn('truncate rounded-sm hover:underline', FOCUS_RING)}
                >
                  {m.employerName}
                </Link>
              </li>
              <li className="inline-flex items-center gap-1.5">
                {m.source === 'MANUAL' ? (
                  <Hand className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                ) : (
                  <Wand2 className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                )}
                {ORIGIN_LABEL[m.source]}
              </li>
              <li className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                Updated <Timestamp date={m.updatedAt} absoluteOnly className="text-xs" />
              </li>
            </ul>
            {m.reasons.length > 0 && (
              <details className="group mt-2">
                <summary
                  className={cn(
                    'inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline',
                    FOCUS_RING,
                  )}
                >
                  <ChevronRight
                    className="size-3.5 transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  Why this score
                </summary>
                <ul className="mt-2 grid gap-x-6 gap-y-1 rounded-xl bg-muted/50 px-3 py-2.5 text-xs sm:grid-cols-2">
                  {m.reasons.map((r) => (
                    <li
                      key={r.label}
                      className={cn(
                        'flex items-baseline justify-between gap-3',
                        r.matched ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <span className="min-w-0">
                        <span aria-hidden className={r.matched ? 'text-emerald-600' : undefined}>
                          {r.matched ? '✓' : '–'}
                        </span>{' '}
                        {r.label}
                        {r.detail ? ` (${r.detail})` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums">{r.points} pts</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
        {actionable && (
          // Own line on phones, under the candidate details.
          <div className="pl-[3.875rem] sm:pl-0">
            <MatchRowActions
              matchId={m.id}
              requisitionId={m.requisitionId}
              personName={m.personName}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function sortMatches(rows: GlobalMatchRow[], sort: string | undefined): GlobalMatchRow[] {
  const copy = [...rows];
  if (sort === 'recent')
    return copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (sort === 'name') return copy.sort((a, b) => a.personName.localeCompare(b.personName));
  return copy; // server order: score, then most recently updated
}
