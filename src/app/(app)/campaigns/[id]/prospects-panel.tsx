'use client';

import { CalendarClock, ChevronRight, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { initialsOf } from '@/components/ds/entity-card';
import { FOCUS_RING, SEG_TRAY, segItem } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatZoned, toZonedLocal } from '@/lib/zoned-time';
import { PROSPECT_STATUS_LABEL } from '@/modules/campaigns/labels';
import type { ProspectRow } from '@/modules/campaigns/service';
import { ProspectActions } from '../../prospects/prospect-actions';
import { AddProspectDialog, type AdOption } from '../../prospects/prospect-dialogs';
import { PROSPECT_DS_TONE } from '../campaign-tones';

type Filter = 'todo' | 'ready' | 'converted' | 'closed' | 'followups' | 'all';

const FILTERS: Array<{
  key: Filter;
  label: string;
  test: (p: ProspectRow, now: number) => boolean;
}> = [
  { key: 'todo', label: 'To screen', test: (p) => p.status === 'NEW' },
  {
    key: 'ready',
    label: 'Ready to convert',
    test: (p) => p.status === 'SCREENED' || p.status === 'RETAINED_IN_POOL',
  },
  {
    key: 'followups',
    label: 'Follow-up due',
    test: (p, now) => Boolean(p.followUpDueAt && new Date(p.followUpDueAt).getTime() <= now),
  },
  { key: 'converted', label: 'Converted', test: (p) => p.status === 'CONVERTED_TO_CANDIDATE' },
  { key: 'closed', label: 'Not suitable', test: (p) => p.status === 'NOT_SUITABLE' },
  { key: 'all', label: 'All', test: () => true },
];

export function ProspectsPanel({
  rows,
  ads,
  canCreate,
  canEdit,
  campaignOpen,
  paused,
  jobTitle,
  assignees,
  nowIso,
}: {
  rows: ProspectRow[];
  ads: AdOption[];
  canCreate: boolean;
  canEdit: boolean;
  campaignOpen: boolean;
  paused?: boolean;
  jobTitle: string | null;
  assignees: Array<{ id: string; fullName: string }>;
  nowIso: string;
}) {
  const now = new Date(nowIso).getTime();
  const counts = useMemo(
    () =>
      Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((p) => f.test(p, now)).length])),
    [rows, now],
  ) as Record<Filter, number>;
  const [filter, setFilter] = useState<Filter>(() =>
    counts.todo > 0 ? 'todo' : counts.ready > 0 ? 'ready' : 'all',
  );
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[FILTERS.length - 1];
  const visible = rows.filter((p) => active?.test(p, now));
  const canAdd = canCreate && campaignOpen && ads.some((a) => a.open);

  return (
    <SectionCard
      testId="campaign-prospects"
      icon={Users}
      title="Prospects"
      count={rows.length}
      description="People who responded to this campaign’s advertisements. Screen them, keep them in the talent pool, or convert them to candidates."
      action={
        canAdd ? (
          <AddProspectDialog
            ads={ads}
            trigger={
              <Button size="sm">
                <UserPlus className="mr-1.5 size-4" /> Record prospect
              </Button>
            }
          />
        ) : undefined
      }
      bodyClassName="space-y-4"
    >
      {!canEdit && (
        <p
          className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          data-testid="prospects-read-only"
        >
          View only — your role cannot change prospects.
        </p>
      )}
      {paused && (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200"
          data-testid="prospects-paused"
        >
          The campaign is paused — new prospects can’t be recorded. Existing prospects can still be
          screened, noted, followed up and converted.
        </p>
      )}
      {canCreate && campaignOpen && !ads.some((a) => a.open) && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Add or reactivate an advertisement first — every prospect responds to one.
        </p>
      )}
      <fieldset className={cn(SEG_TRAY, 'm-0')}>
        <legend className="sr-only">Filter prospects</legend>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={segItem(filter === f.key)}
          >
            {f.label}
            <span
              className={cn(
                'rounded-md px-1.5 text-[11px] tabular-nums',
                filter === f.key ? 'bg-white/20' : 'bg-muted',
              )}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}
      </fieldset>

      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={rows.length === 0 ? 'No prospects yet' : 'Nothing here'}
          description={
            rows.length === 0
              ? 'Record people as they respond to an advertisement.'
              : 'No prospects match this filter.'
          }
        />
      ) : (
        <ul
          className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
          data-testid="prospect-rows"
        >
          {visible.map((p) => {
            const due = p.followUpDueAt ? new Date(p.followUpDueAt) : null;
            const overdue = Boolean(due && due.getTime() <= now);
            return (
              <li key={p.id} data-prospect-status={p.status}>
                <details className="group">
                  <summary
                    className={cn(
                      'flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/30',
                      FOCUS_RING,
                    )}
                  >
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        DS_SOFT[PROSPECT_DS_TONE[p.status]],
                      )}
                    >
                      {initialsOf(p.personName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.personName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.advertisementCountry}
                        {p.advertisementPlatform ? ` · ${p.advertisementPlatform}` : ''} · recorded{' '}
                        <Timestamp date={p.createdAt} absoluteOnly className="text-xs" />
                      </span>
                    </span>
                    {due && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px]',
                          overdue ? 'font-medium text-status-warning' : 'text-muted-foreground',
                        )}
                      >
                        <CalendarClock className="size-3" aria-hidden />
                        {overdue ? 'Follow-up due' : 'Follow-up'} {formatZoned(due)}
                      </span>
                    )}
                    <DsStatusPill tone={PROSPECT_DS_TONE[p.status]}>
                      {PROSPECT_STATUS_LABEL[p.status]}
                    </DsStatusPill>
                  </summary>
                  <div className="space-y-3 border-t border-border/60 bg-muted/20 px-4 py-3 text-sm sm:pl-[4.25rem]">
                    <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                      {(
                        [
                          ['Email', p.personEmail],
                          ['Last handled by', p.screenedByName],
                          ['Follow-up assigned to', p.followUpAssigneeName],
                        ] as const
                      )
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt className="inline text-muted-foreground">{k}: </dt>
                            <dd className="inline">{v}</dd>
                          </div>
                        ))}
                      <div>
                        <dt className="inline text-muted-foreground">Updated: </dt>
                        <dd className="inline">
                          <Timestamp date={p.updatedAt} absoluteOnly className="text-xs" />
                        </dd>
                      </div>
                    </dl>
                    {p.notes && (
                      <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-card px-3 py-2 text-xs">
                        {p.notes}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ProspectActions
                        prospect={{
                          id: p.id,
                          personId: p.personId,
                          personName: p.personName,
                          status: p.status,
                          hasCandidateProfile: p.hasCandidateProfile,
                          followUpDueOn: due
                            ? toZonedLocal(due, 'Europe/Dublin').slice(0, 10)
                            : null,
                        }}
                        canEdit={canEdit}
                        jobTitle={jobTitle}
                        assignees={assignees}
                      />
                      <Link
                        href={`/prospects/${p.id}`}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Full history
                      </Link>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
