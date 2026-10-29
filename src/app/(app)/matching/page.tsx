import { ChevronRight, EyeOff, SearchCheck } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { StatusChip } from '@/components/status-chip';
import { Timestamp } from '@/components/timestamp';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import {
  AVAILABILITY_LABEL,
  BUCKET_LABEL,
  BUCKET_TONE,
  MATCH_STATUS_LABEL,
  MATCH_STATUS_TONE,
  ORIGIN_LABEL,
} from '@/modules/matching/labels';
import { MatchFiltersSchema } from '@/modules/matching/schemas';
import {
  fetchGlobalMatches,
  fetchMatchingJobOptions,
  GLOBAL_LIST_LIMIT,
} from '@/modules/matching/workspace';
import { MatchRowActions, RunMatchingPanel } from './match-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matching' };

const STATUS_CHIPS = [
  { key: 'open', label: 'To review' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
] as const;

type SP = Record<string, string | undefined>;

/**
 * R5 — global Matching workspace: every job's matches in one ranked list,
 * filterable by job, strength, origin, status and availability, with links
 * to the candidate and the job. Confirmed-placed and explicitly
 * unavailable candidates are hidden by default (the count is shown).
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
  const [result, jobs, canEdit] = await Promise.all([
    fetchGlobalMatches(f),
    fetchMatchingJobOptions(),
    checkPermission('recruitment', 'matching', 'edit'),
  ]);
  const status = f.status ?? 'open';
  const openJobs = jobs.filter((j) => j.open);

  const chipHref = (key: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== 'status') p.set(k, v);
    if (key !== 'open') p.set('status', key);
    const qs = p.toString();
    return qs ? `/matching?${qs}` : '/matching';
  };

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
        {canEdit && <RunMatchingPanel jobs={openJobs} defaultJobId={f.requisitionId} />}
        <FilterBar
          action="/matching"
          q={f.q}
          qPlaceholder="Name or email…"
          hidden={{ status: sp.status }}
          selects={[
            {
              name: 'job',
              label: 'Job',
              value: f.requisitionId ?? '',
              options: [
                { value: '', label: 'All jobs' },
                ...jobs.map((j) => ({
                  value: j.id,
                  label: `${j.title} — ${j.employerName}${j.open ? '' : ' (closed)'}`,
                })),
              ],
            },
            {
              name: 'bucket',
              label: 'Strength',
              value: f.bucket ?? '',
              options: [
                { value: '', label: 'Any strength' },
                { value: 'HIGH', label: 'Strong' },
                { value: 'MEDIUM', label: 'Fair' },
                { value: 'LOW', label: 'Weak' },
              ],
            },
            {
              name: 'origin',
              label: 'Origin',
              value: f.origin ?? '',
              options: [
                { value: '', label: 'Any origin' },
                { value: 'ASSISTED', label: 'Assisted' },
                { value: 'MANUAL', label: 'Added by hand' },
              ],
            },
            {
              name: 'availability',
              label: 'Availability',
              value: f.availability ?? 'available',
              options: [
                { value: 'available', label: 'Available only' },
                { value: 'all', label: 'Include placed / unavailable' },
              ],
            },
            {
              name: 'jobs',
              label: 'Jobs',
              value: f.jobs ?? 'open',
              options: [
                { value: 'open', label: 'Open jobs' },
                { value: 'all', label: 'Include closed jobs' },
              ],
            },
          ]}
        />
        <nav aria-label="Match status" className="mb-4 flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((c) => (
            <Link
              key={c.key}
              href={chipHref(c.key)}
              aria-current={status === c.key ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                status === c.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      </FadeUp>

      <FadeUp delay={0.05}>
        {result.hiddenUnavailable > 0 && (
          <p
            className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"
            data-testid="hidden-unavailable"
          >
            <EyeOff className="size-3.5" aria-hidden />
            {result.hiddenUnavailable} placed or unavailable candidate
            {result.hiddenUnavailable === 1 ? '' : 's'} hidden — choose “Include placed /
            unavailable” to see them.
          </p>
        )}
        {result.rows.length === 0 ? (
          <EmptyState
            icon={SearchCheck}
            title="No matches here"
            description={
              status === 'open'
                ? 'Run matching for a job, or change the filters.'
                : 'No matches match these filters.'
            }
          />
        ) : (
          <ul
            className="divide-y rounded-2xl border bg-card shadow-sm ring-1 ring-border/60"
            data-testid="match-rows"
          >
            {result.rows.map((m) => {
              const jobOpen =
                m.requisitionStatus !== 'CLOSED' && m.requisitionStatus !== 'CANCELLED';
              const unavailable =
                m.confirmedPlaced ||
                m.availabilityStatus === 'PLACED' ||
                m.availabilityStatus === 'TEMPORARILY_UNAVAILABLE';
              return (
                <li key={m.id} className="px-3 py-3 sm:px-4" data-match-status={m.status}>
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className={cn(
                        'grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums',
                        BUCKET_TONE[m.scoreBucket],
                      )}
                      title={`${BUCKET_LABEL[m.scoreBucket]} match`}
                    >
                      {m.score}
                      <span className="sr-only">
                        {' '}
                        points, {BUCKET_LABEL[m.scoreBucket].toLowerCase()} match
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/candidates/${m.personId}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {m.personName}
                        </Link>
                        <StatusChip
                          label={MATCH_STATUS_LABEL[m.status]}
                          tone={MATCH_STATUS_TONE[m.status]}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {ORIGIN_LABEL[m.source]}
                        </span>
                        {unavailable && (
                          <StatusChip
                            label={
                              m.confirmedPlaced
                                ? 'Placed'
                                : (AVAILABILITY_LABEL[m.availabilityStatus ?? ''] ?? 'Unavailable')
                            }
                            tone="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          />
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <Link
                          href={`/requisitions/${m.requisitionId}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {m.requisitionTitle}
                        </Link>
                        {' · '}
                        <Link
                          href={`/employers/${m.employerId}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {m.employerName}
                        </Link>
                        {!jobOpen && ' · job closed'}
                        {' · updated '}
                        <Timestamp date={m.updatedAt} absoluteOnly className="text-xs" />
                      </p>
                      {m.reasons.length > 0 && (
                        <details className="group mt-1.5">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <ChevronRight
                              className="size-3 transition-transform group-open:rotate-90"
                              aria-hidden
                            />
                            Why this score
                          </summary>
                          <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                            {m.reasons.map((r) => (
                              <li
                                key={r.label}
                                className={r.matched ? 'text-foreground' : 'text-muted-foreground'}
                              >
                                {r.matched ? '✓' : '–'} {r.label}
                                {r.detail ? ` (${r.detail})` : ''} · {r.points} pts
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    {canEdit &&
                      jobOpen &&
                      (m.status === 'SUGGESTED' || m.status === 'REVIEWED') && (
                        // Own line on phones so the candidate column keeps its width.
                        <div className="w-full pl-14 sm:w-auto sm:pl-0">
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
            })}
          </ul>
        )}
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
      </FadeUp>
    </div>
  );
}
