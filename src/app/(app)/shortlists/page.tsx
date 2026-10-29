import { CalendarCheck, History, ListChecks, MessageSquareText, UserMinus } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FilterBar } from '@/components/filter-bar';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { StatusChip } from '@/components/status-chip';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { todayInDublin } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { formatZoned, toZonedLocal } from '@/lib/zoned-time';
import { ShortlistFiltersSchema } from '@/modules/matching/schemas';
import {
  fetchGlobalShortlists,
  fetchMatchingJobOptions,
  fetchShortlistRemovals,
  GLOBAL_LIST_LIMIT,
} from '@/modules/matching/workspace';
import { FeedbackDialog, PresentedDialog, RemoveFromShortlistDialog } from './shortlist-dialogs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shortlists' };

type SP = Record<string, string | undefined>;

/**
 * R5 — global Shortlists workspace. Current: every shortlisted candidate
 * across jobs with presentation and employer-feedback tracking. Removed:
 * the removal history read from the immutable audit snapshots.
 */
export default async function ShortlistsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission('recruitment', 'matching', 'view');
  const sp = await searchParams;
  const view = sp.view === 'removed' ? 'removed' : 'current';
  const parsed = ShortlistFiltersSchema.safeParse({
    q: sp.q || undefined,
    requisitionId: sp.job || undefined,
    presentation: sp.presentation || undefined,
    jobs: sp.jobs || undefined,
  });
  const f = parsed.success ? parsed.data : {};
  const [jobs, canEdit] = await Promise.all([
    fetchMatchingJobOptions(),
    checkPermission('recruitment', 'matching', 'edit'),
  ]);
  const today = todayInDublin();

  const tabHref = (v: 'current' | 'removed') =>
    v === 'removed' ? '/shortlists?view=removed' : '/shortlists';
  const jobSelect = {
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
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={ListChecks}
          iconTone="pink"
          title="Shortlists"
          description="Shortlisted candidates across all jobs: record when each was presented to the employer and what the employer said."
        />
      </FadeUp>
      <FadeUp delay={0.03}>
        <nav
          aria-label="Shortlist views"
          className="mb-4 flex gap-1 rounded-2xl bg-card p-1.5 shadow-sm ring-1 ring-border/60 sm:w-fit"
        >
          {(['current', 'removed'] as const).map((v) => (
            <Link
              key={v}
              href={tabHref(v)}
              aria-current={view === v ? 'page' : undefined}
              className={cn(
                'flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium transition-colors sm:flex-none',
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'current' ? 'Shortlisted' : 'Removal history'}
            </Link>
          ))}
        </nav>
        <FilterBar
          action="/shortlists"
          q={f.q}
          qPlaceholder="Name or email…"
          hidden={{ view: view === 'removed' ? 'removed' : undefined }}
          selects={
            view === 'removed'
              ? [jobSelect]
              : [
                  jobSelect,
                  {
                    name: 'presentation',
                    label: 'Employer stage',
                    value: f.presentation ?? 'all',
                    options: [
                      { value: 'all', label: 'Any stage' },
                      { value: 'not_presented', label: 'Not presented yet' },
                      { value: 'awaiting_feedback', label: 'Awaiting feedback' },
                      { value: 'feedback', label: 'Feedback received' },
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
                ]
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        {view === 'removed' ? (
          <RemovalHistory requisitionId={f.requisitionId} q={f.q} />
        ) : (
          <CurrentShortlists filters={f} canEdit={canEdit} today={today} />
        )}
        {!canEdit && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="shortlists-read-only">
            View only — your role cannot change shortlists.
          </p>
        )}
      </FadeUp>
    </div>
  );
}

async function CurrentShortlists({
  filters,
  canEdit,
  today,
}: {
  filters: Parameters<typeof fetchGlobalShortlists>[0];
  canEdit: boolean;
  today: string;
}) {
  const { rows, capped } = await fetchGlobalShortlists(filters);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Nobody shortlisted here"
        description="Shortlist candidates from Matching or a job’s pipeline, or change the filters."
      />
    );
  }
  return (
    <>
      <ul
        className="divide-y rounded-2xl border bg-card shadow-sm ring-1 ring-border/60"
        data-testid="shortlist-rows"
      >
        {rows.map((s) => {
          const jobOpen = s.requisitionStatus !== 'CLOSED' && s.requisitionStatus !== 'CANCELLED';
          const stage = s.employerFeedback
            ? {
                label: 'Feedback received',
                tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
              }
            : s.presentedToEmployerAt
              ? {
                  label: 'Awaiting feedback',
                  tone: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
                }
              : { label: 'Not presented', tone: 'bg-muted text-muted-foreground' };
          return (
            <li key={s.id} className="px-3 py-3 sm:px-4" data-shortlist-entry={s.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/candidates/${s.personId}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {s.personName}
                    </Link>
                    <StatusChip label={stage.label} tone={stage.tone} />
                    {s.score !== null && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        Score {s.score}
                        {s.source === 'MANUAL' ? ' · added by hand' : ''}
                      </span>
                    )}
                    {s.applicationStatus && (
                      <StatusChip
                        label={`Applied · ${s.applicationStatus.toLowerCase().replace(/_/g, ' ')}`}
                        tone="bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <Link
                      href={`/requisitions/${s.requisitionId}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {s.requisitionTitle}
                    </Link>
                    {' · '}
                    <Link
                      href={`/employers/${s.employerId}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {s.employerName}
                    </Link>
                    {!jobOpen && ' · job closed'}
                  </p>
                  <dl className="mt-1.5 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="inline text-muted-foreground">Shortlisted: </dt>
                      <dd className="inline">
                        <Timestamp date={s.shortlistedAt} absoluteOnly className="text-xs" />
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Presented to employer: </dt>
                      <dd className="inline">
                        {s.presentedToEmployerAt
                          ? formatZoned(s.presentedToEmployerAt).replace(/ · 12:00.*$/, '')
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  {s.employerFeedback && (
                    <p
                      className="mt-1.5 whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-xs"
                      data-testid="employer-feedback"
                    >
                      <span className="font-medium">Employer feedback: </span>
                      {s.employerFeedback}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                    <PresentedDialog
                      entryId={s.id}
                      requisitionId={s.requisitionId}
                      personName={s.personName}
                      today={today}
                      current={
                        s.presentedToEmployerAt
                          ? toZonedLocal(s.presentedToEmployerAt, 'Europe/Dublin').slice(0, 10)
                          : null
                      }
                      trigger={
                        <Button size="sm" variant={s.presentedToEmployerAt ? 'ghost' : 'default'}>
                          <CalendarCheck className="mr-1.5 size-3.5" aria-hidden />
                          {s.presentedToEmployerAt ? 'Change date' : 'Mark presented'}
                        </Button>
                      }
                    />
                    {s.presentedToEmployerAt && (
                      <FeedbackDialog
                        entryId={s.id}
                        requisitionId={s.requisitionId}
                        personName={s.personName}
                        current={s.employerFeedback}
                        trigger={
                          <Button size="sm" variant="outline">
                            <MessageSquareText className="mr-1.5 size-3.5" aria-hidden />
                            {s.employerFeedback ? 'Edit feedback' : 'Add feedback'}
                          </Button>
                        }
                      />
                    )}
                    <RemoveFromShortlistDialog
                      entryId={s.id}
                      requisitionId={s.requisitionId}
                      personName={s.personName}
                      jobTitle={s.requisitionTitle}
                      trigger={
                        <Button size="sm" variant="ghost">
                          <UserMinus className="mr-1.5 size-3.5" aria-hidden /> Remove
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {capped && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first {GLOBAL_LIST_LIMIT}. Narrow the filters to see more.
        </p>
      )}
    </>
  );
}

async function RemovalHistory({ requisitionId, q }: { requisitionId?: string; q?: string }) {
  const rows = await fetchShortlistRemovals({ requisitionId, q });
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No removals recorded"
        description="When someone is taken off a shortlist, the reason and a full record appear here."
      />
    );
  }
  return (
    <ol
      className="divide-y rounded-2xl border bg-card shadow-sm ring-1 ring-border/60"
      data-testid="removal-rows"
    >
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm">
              {r.personId ? (
                <Link href={`/candidates/${r.personId}`} className="font-medium hover:underline">
                  {r.personName ?? 'Candidate'}
                </Link>
              ) : (
                <span className="font-medium">{r.personName ?? 'Candidate'}</span>
              )}{' '}
              removed from{' '}
              {r.requisitionId ? (
                <Link href={`/requisitions/${r.requisitionId}`} className="hover:underline">
                  {r.requisitionTitle ?? 'a job'}
                </Link>
              ) : (
                (r.requisitionTitle ?? 'a job')
              )}
            </p>
            <Timestamp date={r.removedAt} absoluteOnly className="text-[11px]" />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            By {r.removedByName ?? 'System'}
            {r.reason
              ? ` — ${r.reason}`
              : r.legacy
                ? ' — recorded before reasons were required'
                : ''}
          </p>
          {!r.legacy && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Shortlisted {r.shortlistedAt ? formatZoned(new Date(r.shortlistedAt)) : '—'} ·
              presented{' '}
              {r.presentedToEmployerAt
                ? formatZoned(new Date(r.presentedToEmployerAt)).replace(/ · 12:00.*$/, '')
                : 'no'}
              {r.employerFeedback ? ` · feedback: ${r.employerFeedback}` : ''}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
