import {
  Briefcase,
  Building2,
  CalendarCheck,
  Gauge,
  Hand,
  History,
  Hourglass,
  ListChecks,
  MessageSquareText,
  Send,
  UserMinus,
} from 'lucide-react';
import Link from 'next/link';
import { initialsOf } from '@/components/ds/entity-card';
import { FilterToolbar, StatusTabs } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { FOCUS_RING, SEG_TRAY, segItem } from '@/components/ds/segmented';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DsEnumPill, DsStatusPill, enumLabel } from '@/components/ds/status-pill';
import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { todayInDublin } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { formatZoned, toZonedLocal } from '@/lib/zoned-time';
import { ShortlistFiltersSchema } from '@/modules/matching/schemas';
import {
  countGlobalShortlists,
  fetchGlobalShortlists,
  fetchMatchingJobOptions,
  fetchShortlistRemovals,
  GLOBAL_LIST_LIMIT,
  type GlobalShortlistRow,
} from '@/modules/matching/workspace';
import { FeedbackDialog, PresentedDialog, RemoveFromShortlistDialog } from './shortlist-dialogs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shortlists' };

type SP = Record<string, string | undefined>;

/**
 * R5 — global Shortlists workspace. Current: every shortlisted candidate
 * across jobs with presentation and employer-feedback tracking. Removed:
 * the removal history read from the immutable audit snapshots.
 *
 * Stage 6G — page header, KPI tiles, Shortlisted / Removal history
 * segmented views, filter toolbar, employer-stage tabs with counts + sort,
 * shortlist rows, pagination. URL params unchanged (`job`, `q`,
 * `presentation`, `jobs`, `view`).
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
  const [jobs, canEdit, counts] = await Promise.all([
    fetchMatchingJobOptions(),
    checkPermission('recruitment', 'matching', 'edit'),
    countGlobalShortlists(f),
  ]);
  const today = todayInDublin();

  const viewHref = (v: 'current' | 'removed') => {
    const p = new URLSearchParams();
    if (v === 'removed') p.set('view', 'removed');
    if (sp.job) p.set('job', sp.job);
    if (sp.q) p.set('q', sp.q);
    const qs = p.toString();
    return qs ? `/shortlists?${qs}` : '/shortlists';
  };
  const jobSelect = {
    param: 'job',
    label: 'Job',
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
        <StatTileGrid>
          <StatTile
            icon={ListChecks}
            tone="blue"
            label="Shortlisted"
            value={counts.all}
            hint="Across the jobs in view"
          />
          <StatTile
            icon={Send}
            tone="slate"
            label="Not presented"
            value={counts.notPresented}
            hint="Not yet sent to the employer"
          />
          <StatTile
            icon={Hourglass}
            tone="amber"
            label="Awaiting feedback"
            value={counts.awaitingFeedback}
            hint="Presented, no reply yet"
          />
          <StatTile
            icon={MessageSquareText}
            tone="green"
            label="Feedback received"
            value={counts.feedback}
            hint={`${counts.applied} already applied`}
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.05}>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Shortlist views" className={SEG_TRAY}>
            {(['current', 'removed'] as const).map((v) => (
              <Link
                key={v}
                href={viewHref(v)}
                aria-current={view === v ? 'page' : undefined}
                className={segItem(view === v)}
              >
                {v === 'current' ? (
                  <ListChecks className="size-3.5" aria-hidden />
                ) : (
                  <History className="size-3.5" aria-hidden />
                )}
                {v === 'current' ? 'Shortlisted' : 'Removal history'}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-3">
          <FilterToolbar
            searchPlaceholder="Search by candidate name or email…"
            selects={
              view === 'removed'
                ? [jobSelect]
                : [
                    jobSelect,
                    {
                      param: 'jobs',
                      label: 'Jobs',
                      options: [
                        { value: '', label: 'Open jobs' },
                        { value: 'all', label: 'Include closed jobs' },
                      ],
                    },
                  ]
            }
          />
        </div>
        {view === 'current' && (
          <div className="mt-4">
            <StatusTabs
              ariaLabel="Employer stage"
              param="presentation"
              tabs={[
                { key: 'all', label: 'All', count: counts.all },
                {
                  key: 'not_presented',
                  label: 'Not presented',
                  count: counts.notPresented,
                  tone: 'slate',
                },
                {
                  key: 'awaiting_feedback',
                  label: 'Awaiting feedback',
                  count: counts.awaitingFeedback,
                  tone: 'amber',
                },
                {
                  key: 'feedback',
                  label: 'Feedback received',
                  count: counts.feedback,
                  tone: 'green',
                },
              ]}
              sort={SORTS}
            />
          </div>
        )}
      </FadeUp>

      <FadeUp delay={0.07}>
        <div className="mt-4">
          {view === 'removed' ? (
            <RemovalHistory requisitionId={f.requisitionId} q={f.q} />
          ) : (
            <CurrentShortlists filters={f} canEdit={canEdit} today={today} sp={sp} />
          )}
          {!canEdit && (
            <p className="mt-3 text-xs text-muted-foreground" data-testid="shortlists-read-only">
              View only — your role cannot change shortlists.
            </p>
          )}
        </div>
      </FadeUp>
    </div>
  );
}

const SORTS = [
  { value: 'recent', label: 'Recently shortlisted' },
  { value: 'presented', label: 'Recently presented' },
  { value: 'name', label: 'Name A–Z' },
];
const PER_OPTIONS = [20, 50, 100];

/** Where the entry is with the employer → label + Stage 6G tone. */
function employerStage(s: GlobalShortlistRow): { label: string; tone: DsTone } {
  if (s.employerFeedback) return { label: 'Feedback received', tone: 'green' };
  if (s.presentedToEmployerAt) return { label: 'Awaiting feedback', tone: 'amber' };
  return { label: 'Not presented', tone: 'slate' };
}

function sortShortlists(rows: GlobalShortlistRow[], sort: string | undefined) {
  const copy = [...rows];
  if (sort === 'name') return copy.sort((a, b) => a.personName.localeCompare(b.personName));
  if (sort === 'presented')
    return copy.sort(
      (a, b) =>
        (b.presentedToEmployerAt ? new Date(b.presentedToEmployerAt).getTime() : 0) -
        (a.presentedToEmployerAt ? new Date(a.presentedToEmployerAt).getTime() : 0),
    );
  return copy; // server order: most recently shortlisted first
}

async function CurrentShortlists({
  filters,
  canEdit,
  today,
  sp,
}: {
  filters: Parameters<typeof fetchGlobalShortlists>[0];
  canEdit: boolean;
  today: string;
  sp: SP;
}) {
  const { rows, capped } = await fetchGlobalShortlists(filters);
  const pageData = paginate(sortShortlists(rows, sp.sort), sp.page, sp.per, PER_OPTIONS);
  if (pageData.total === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <EmptyState
          icon={ListChecks}
          title="Nobody shortlisted here"
          description="Shortlist candidates from Matching or a job’s pipeline, or change the filters."
        />
      </div>
    );
  }
  return (
    <>
      <ul
        className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
        data-testid="shortlist-rows"
      >
        {pageData.items.map((s) => {
          const jobOpen = s.requisitionStatus !== 'CLOSED' && s.requisitionStatus !== 'CANCELLED';
          const stage = employerStage(s);
          return (
            <li key={s.id} className="px-4 py-4 sm:px-5" data-shortlist-entry={s.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3.5">
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold',
                      DS_SOFT[stage.tone === 'slate' ? 'blue' : stage.tone],
                    )}
                  >
                    {initialsOf(s.personName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/candidates/${s.personId}`}
                        className={cn(
                          'truncate rounded-sm text-[15px] font-semibold text-foreground hover:underline',
                          FOCUS_RING,
                        )}
                      >
                        {s.personName}
                      </Link>
                      <DsStatusPill tone={stage.tone}>{stage.label}</DsStatusPill>
                      {s.applicationStatus && (
                        <DsEnumPill
                          status={s.applicationStatus}
                          label={`Applied · ${enumLabel(s.applicationStatus).toLowerCase()}`}
                        />
                      )}
                    </div>
                    <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/80">
                      <li className="inline-flex min-w-0 items-center gap-1.5">
                        <Briefcase className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                        <Link
                          href={`/requisitions/${s.requisitionId}`}
                          className={cn('truncate rounded-sm hover:underline', FOCUS_RING)}
                        >
                          {s.requisitionTitle}
                        </Link>
                        {!jobOpen && <span className="text-muted-foreground">· job closed</span>}
                      </li>
                      <li className="inline-flex min-w-0 items-center gap-1.5">
                        <Building2 className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                        <Link
                          href={`/employers/${s.employerId}`}
                          className={cn('truncate rounded-sm hover:underline', FOCUS_RING)}
                        >
                          {s.employerName}
                        </Link>
                      </li>
                      {s.source === 'MANUAL' ? (
                        <li className="inline-flex items-center gap-1.5">
                          <Hand className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                          Added by hand
                        </li>
                      ) : (
                        s.score !== null && (
                          <li className="inline-flex items-center gap-1.5 tabular-nums">
                            <Gauge className="size-3.5 shrink-0 text-sky-600" aria-hidden />
                            Match score {s.score}
                          </li>
                        )
                      )}
                    </ul>
                    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <div className="inline-flex items-center gap-1.5">
                        <dt className="text-muted-foreground">Shortlisted</dt>
                        <dd>
                          <Timestamp date={s.shortlistedAt} absoluteOnly className="text-xs" />
                        </dd>
                      </div>
                      {s.presentedToEmployerAt && (
                        <div className="inline-flex items-center gap-1.5">
                          <dt className="text-muted-foreground">Presented to employer</dt>
                          <dd>{formatZoned(s.presentedToEmployerAt).replace(/ · 12:00.*$/, '')}</dd>
                        </div>
                      )}
                    </dl>
                    {s.employerFeedback && (
                      <p
                        className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 px-3 py-2 text-xs text-foreground/90"
                        data-testid="employer-feedback"
                      >
                        <span className="font-medium">Employer feedback: </span>
                        {s.employerFeedback}
                      </p>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pl-[3.75rem] lg:justify-end lg:pl-0">
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
                        <Button size="sm" variant={s.presentedToEmployerAt ? 'outline' : 'default'}>
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
                          <Button size="sm" variant={s.employerFeedback ? 'outline' : 'default'}>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                        >
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
      <Pagination
        basePath="/shortlists"
        params={sp}
        page={pageData.page}
        pages={pageData.pages}
        per={pageData.per}
        total={pageData.total}
        start={pageData.start}
        noun="shortlisted"
        perOptions={PER_OPTIONS}
      />
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
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <EmptyState
          icon={History}
          title="No removals recorded"
          description="When someone is taken off a shortlist, the reason and a full record appear here."
        />
      </div>
    );
  }
  return (
    <ol
      className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
      data-testid="removal-rows"
    >
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
          <span
            aria-hidden
            className={cn('grid size-10 shrink-0 place-items-center rounded-full', DS_SOFT.rose)}
          >
            <UserMinus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
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
              <Timestamp
                date={r.removedAt}
                absoluteOnly
                className="text-xs text-muted-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-foreground/80">
              By {r.removedByName ?? 'System'}
              {r.reason
                ? ` — ${r.reason}`
                : r.legacy
                  ? ' — recorded before reasons were required'
                  : ''}
            </p>
            {!r.legacy && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.shortlistedAt && <>Shortlisted {formatZoned(new Date(r.shortlistedAt))} · </>}
                {r.presentedToEmployerAt
                  ? `presented ${formatZoned(new Date(r.presentedToEmployerAt)).replace(/ · 12:00.*$/, '')}`
                  : 'not presented'}
                {r.employerFeedback ? ` · feedback: ${r.employerFeedback}` : ''}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
