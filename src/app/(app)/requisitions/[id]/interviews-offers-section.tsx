'use client';

import { format } from 'date-fns';
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Handshake,
  Link2,
  MapPin,
  Pencil,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SEG_TRAY, segItem } from '@/components/ds/segmented';
import { DsStatusPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { formatZoned } from '@/lib/zoned-time';
import type {
  RequisitionApplicationOption,
  RequisitionInterviewRow,
  RequisitionOfferRow,
} from '@/modules/requisitions/workspace';
import {
  CancelInterviewDialog,
  INTERVIEWABLE,
  InterviewFormDialog,
  InterviewResultDialog,
} from './interview-dialogs';
import { OfferFormDialog, OfferTransitionDialog, PlaceCandidateDialog } from './offer-dialogs';

/**
 * R3 — Interviews & Offers, functional. Writes are only offered when the
 * signed-in user holds `recruitment.interviews`; the server checks again.
 * Placement is a hand-off to R0's guarded action, never automatic.
 */

type InterviewView = 'upcoming' | 'overdue' | 'completed' | 'closed' | 'all';
type OfferView = 'open' | 'accepted' | 'closed' | 'all';

const OFFER_NEXT: Record<string, string[]> = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['NEGOTIATING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
  NEGOTIATING: ['SENT', 'REJECTED', 'WITHDRAWN'],
};
const OFFER_ACTION_LABEL: Record<string, string> = {
  SENT: 'Record as sent',
  NEGOTIATING: 'Negotiating',
  ACCEPTED: 'Record acceptance',
  REJECTED: 'Record decline',
  WITHDRAWN: 'Withdraw',
  EXPIRED: 'Mark expired',
};
const SEAT_HOLDING = ['CONFIRMED', 'STARTED', 'COMPLETED'];

function interviewState(i: RequisitionInterviewRow, now: number) {
  if (i.status === 'SCHEDULED') {
    return new Date(i.scheduledAt).getTime() > now
      ? { key: 'upcoming' as const, label: 'Upcoming', tone: 'info' as const }
      : { key: 'overdue' as const, label: 'Needs result', tone: 'warning' as const };
  }
  if (i.status === 'COMPLETED')
    return { key: 'completed' as const, label: 'Completed', tone: 'success' as const };
  if (i.status === 'NO_SHOW')
    return { key: 'closed' as const, label: 'No-show', tone: 'destructive' as const };
  if (i.status === 'RESCHEDULED')
    return { key: 'closed' as const, label: 'Rescheduled', tone: 'secondary' as const };
  return { key: 'closed' as const, label: 'Cancelled', tone: 'secondary' as const };
}

function offerGroup(status: string): Exclude<OfferView, 'all'> {
  if (status === 'ACCEPTED') return 'accepted';
  if (status === 'DRAFT' || status === 'SENT' || status === 'NEGOTIATING') return 'open';
  return 'closed';
}

const PILL_TONE: Record<string, DsTone> = {
  info: 'blue',
  warning: 'amber',
  success: 'green',
  destructive: 'rose',
  secondary: 'slate',
};

function StateBadge({ label, tone }: { label: string; tone: string }) {
  return <DsStatusPill tone={PILL_TONE[tone] ?? 'slate'}>{label}</DsStatusPill>;
}

/** Stage 6G segmented filter (client state, not URL). */
function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count: number }>;
  label: string;
}) {
  return (
    <fieldset className={cn(SEG_TRAY, 'm-0 shadow-none')}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={segItem(active)}
          >
            {o.label}
            <span
              className={cn(
                'rounded px-1 text-[11px] tabular-nums',
                active ? 'bg-white/20' : 'bg-muted text-muted-foreground',
              )}
            >
              {o.count}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

function isUrl(s: string | null): s is string {
  return Boolean(s && /^https?:\/\//i.test(s));
}

export function InterviewsOffersSection({
  interviews,
  offers,
  applications,
  currencies,
  canManage,
  canPlace: mayPlace = true,
  nowIso,
}: {
  interviews: RequisitionInterviewRow[];
  offers: RequisitionOfferRow[];
  applications: RequisitionApplicationOption[];
  currencies: string[];
  canManage: boolean;
  /** R6 — "Place candidate" needs recruitment.placements (create). */
  canPlace?: boolean;
  nowIso: string;
}) {
  const now = new Date(nowIso).getTime();
  const today = nowIso.slice(0, 10);
  const appById = new Map(applications.map((a) => [a.applicationId, a]));
  const states = interviews.map((i) => ({ i, s: interviewState(i, now) }));
  const overdueCount = states.filter((x) => x.s.key === 'overdue').length;
  const [iView, setIView] = useState<InterviewView>(overdueCount > 0 ? 'overdue' : 'upcoming');
  const [oView, setOView] = useState<OfferView>('open');
  const canInterviewSomeone = applications.some((a) => INTERVIEWABLE.includes(a.status));
  const canOfferSomeone = applications.some(
    (a) => a.status === 'INTERVIEW' || a.status === 'OFFER',
  );

  const visibleInterviews = states.filter((x) => iView === 'all' || x.s.key === iView);
  const sortedInterviews =
    iView === 'upcoming'
      ? [...visibleInterviews].sort(
          (a, b) => new Date(a.i.scheduledAt).getTime() - new Date(b.i.scheduledAt).getTime(),
        )
      : visibleInterviews;
  const visibleOffers = offers.filter((o) => oView === 'all' || offerGroup(o.status) === oView);

  const count = (k: string) => states.filter((x) => x.s.key === k).length;
  const oCount = (k: string) => offers.filter((o) => offerGroup(o.status) === k).length;

  return (
    <div className="space-y-6" data-testid="interviews-offers">
      {!canManage && (
        <p className="text-xs text-muted-foreground" data-testid="io-read-only">
          View only — scheduling interviews and managing offers needs the Recruitment › Interviews
          permission.
        </p>
      )}

      {/* ── Interviews ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <CalendarClock className="size-[18px] text-primary" aria-hidden />
              Interviews
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Times shown in Irish time.</p>
          </div>
          {canManage && (
            <InterviewFormDialog
              applications={applications}
              trigger={
                <Button size="sm" variant="outline" disabled={!canInterviewSomeone}>
                  <CalendarPlus className="mr-1.5 size-4" aria-hidden /> Schedule interview
                </Button>
              }
            />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterChips
            label="Filter interviews"
            value={iView}
            onChange={setIView}
            options={[
              { value: 'upcoming', label: 'Upcoming', count: count('upcoming') },
              { value: 'overdue', label: 'Needs result', count: count('overdue') },
              { value: 'completed', label: 'Completed', count: count('completed') },
              { value: 'closed', label: 'Cancelled / no-show', count: count('closed') },
              { value: 'all', label: 'All', count: interviews.length },
            ]}
          />
          {sortedInterviews.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={interviews.length === 0 ? 'No interviews yet' : 'Nothing in this view'}
              description={
                interviews.length === 0
                  ? canInterviewSomeone
                    ? 'Schedule the first interview for a candidate on this job.'
                    : 'Add or promote candidates on the Pipeline tab, then schedule interviews here.'
                  : 'Try another filter.'
              }
            />
          ) : (
            <ul
              className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
              data-testid="interview-rows"
            >
              {sortedInterviews.map(({ i, s }) => (
                <li key={i.id} data-interview-state={s.key} className="px-4 py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <Link
                            href={`/clients/${i.personId}`}
                            className="font-medium text-foreground hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {i.personName}
                          </Link>
                          <span className="text-xs text-muted-foreground">Round {i.round}</span>
                          <StateBadge label={s.label} tone={s.tone} />
                          {i.status === 'COMPLETED' && i.outcome !== 'PENDING' && (
                            <DsStatusPill
                              tone={
                                i.outcome === 'PASS'
                                  ? 'green'
                                  : i.outcome === 'FAIL'
                                    ? 'rose'
                                    : 'amber'
                              }
                            >
                              {i.outcome === 'PASS'
                                ? 'Pass'
                                : i.outcome === 'FAIL'
                                  ? 'Not successful'
                                  : 'On hold'}
                            </DsStatusPill>
                          )}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">
                            {formatZoned(new Date(i.scheduledAt))}
                          </span>
                          <span>{i.mode.replace(/_/g, ' ').toLowerCase()}</span>
                          {i.durationMinutes ? <span>{i.durationMinutes} min</span> : null}
                          {i.interviewerNames ? <span>with {i.interviewerNames}</span> : null}
                        </p>
                      </div>
                      <ChevronDown
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                      {i.location &&
                        (isUrl(i.location) ? (
                          <a
                            href={i.location}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                          >
                            <Link2 className="size-3" aria-hidden /> Join meeting
                          </a>
                        ) : (
                          <p className="inline-flex items-center gap-1 text-muted-foreground">
                            <MapPin className="size-3" aria-hidden /> {i.location}
                          </p>
                        ))}
                      {i.notes && (
                        <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-foreground/80">
                          {i.notes}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        Scheduled by {i.scheduledByName ?? 'unknown'} · last change{' '}
                        <Timestamp date={i.updatedAt} absoluteOnly className="inline" />
                      </p>
                      {canManage && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {i.status === 'SCHEDULED' && s.key === 'overdue' && (
                            <InterviewResultDialog
                              interview={i}
                              mode="record"
                              trigger={<Button size="sm">Record result</Button>}
                            />
                          )}
                          {i.status === 'SCHEDULED' && (
                            <>
                              <InterviewFormDialog
                                applications={applications}
                                existing={i}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    <Pencil className="mr-1.5 size-3.5" aria-hidden /> Edit
                                  </Button>
                                }
                              />
                              <CancelInterviewDialog
                                interview={i}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    Cancel
                                  </Button>
                                }
                              />
                            </>
                          )}
                          {i.status === 'COMPLETED' && (
                            <InterviewResultDialog
                              interview={i}
                              mode="feedback"
                              trigger={
                                <Button size="sm" variant="outline">
                                  Update feedback
                                </Button>
                              }
                            />
                          )}
                          {i.status === 'COMPLETED' &&
                            i.outcome === 'PASS' &&
                            appById.get(i.applicationId)?.status === 'INTERVIEW' && (
                              <OfferFormDialog
                                applications={applications}
                                currencies={currencies}
                                defaultApplicationId={i.applicationId}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    Create offer{' '}
                                    <ArrowRight className="ml-1 size-3.5" aria-hidden />
                                  </Button>
                                }
                              />
                            )}
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Offers ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
              <Handshake className="size-[18px] text-primary" aria-hidden />
              Offers
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Offers are sent by you outside the CRM; here you record what happened.
            </p>
          </div>
          {canManage && (
            <OfferFormDialog
              applications={applications}
              currencies={currencies}
              trigger={
                <Button size="sm" variant="outline" disabled={!canOfferSomeone}>
                  <Plus className="mr-1.5 size-4" aria-hidden /> Create offer
                </Button>
              }
            />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <FilterChips
            label="Filter offers"
            value={oView}
            onChange={setOView}
            options={[
              { value: 'open', label: 'Open', count: oCount('open') },
              { value: 'accepted', label: 'Accepted', count: oCount('accepted') },
              { value: 'closed', label: 'Closed', count: oCount('closed') },
              { value: 'all', label: 'All', count: offers.length },
            ]}
          />
          {visibleOffers.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title={offers.length === 0 ? 'No offers yet' : 'Nothing in this view'}
              description={
                offers.length === 0
                  ? 'Create an offer once a candidate reaches the Interview stage.'
                  : 'Try another filter.'
              }
            />
          ) : (
            <ul
              className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
              data-testid="offer-rows"
            >
              {visibleOffers.map((o) => {
                const app = appById.get(o.applicationId);
                const responseOverdue =
                  (o.status === 'SENT' || o.status === 'NEGOTIATING') &&
                  Boolean(o.expiresOn && o.expiresOn < today);
                const placed = app?.placementStatus && SEAT_HOLDING.includes(app.placementStatus);
                const canPlace =
                  mayPlace && o.status === 'ACCEPTED' && app?.status === 'OFFER' && !placed;
                return (
                  <li key={o.id} data-offer-status={o.status} className="px-4 py-3">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm">
                            <Link
                              href={`/clients/${o.personId}`}
                              className="font-medium text-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {o.personName}
                            </Link>
                            <StateBadge
                              label={o.status.replace(/_/g, ' ').toLowerCase()}
                              tone={
                                o.status === 'ACCEPTED'
                                  ? 'success'
                                  : offerGroup(o.status) === 'open'
                                    ? 'info'
                                    : 'secondary'
                              }
                            />
                            {responseOverdue && (
                              <StateBadge label="Response overdue" tone="warning" />
                            )}
                            {o.status === 'ACCEPTED' && placed && (
                              <StateBadge
                                label={`Placed · ${app?.placementStatus?.toLowerCase()}`}
                                tone="success"
                              />
                            )}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="font-medium tabular-nums text-foreground/80">
                              {formatCurrency(o.amount, o.currencyCode, {
                                maximumFractionDigits: 0,
                              })}{' '}
                              {o.period.toLowerCase()}
                            </span>
                            {o.startDate && (
                              <span>Starts {format(new Date(o.startDate), 'd MMM yyyy')}</span>
                            )}
                            {o.expiresOn && (
                              <span>Respond by {format(new Date(o.expiresOn), 'd MMM yyyy')}</span>
                            )}
                          </p>
                        </div>
                        <ChevronDown
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                        {o.terms && (
                          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-foreground/80">
                            {o.terms}
                          </p>
                        )}
                        {o.notes && (
                          <p className="whitespace-pre-wrap text-muted-foreground">{o.notes}</p>
                        )}
                        <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                          <span>
                            Created by {o.createdByName ?? 'unknown'}{' '}
                            <Timestamp date={o.createdAt} absoluteOnly className="inline" />
                          </span>
                          {o.sentAt && (
                            <span>
                              Recorded as sent{' '}
                              <Timestamp date={o.sentAt} absoluteOnly className="inline" />
                            </span>
                          )}
                          {o.respondedAt && (
                            <span>
                              Candidate responded{' '}
                              <Timestamp date={o.respondedAt} absoluteOnly className="inline" />
                            </span>
                          )}
                        </p>
                        {canManage && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {canPlace && app && (
                              <PlaceCandidateDialog
                                application={app}
                                offer={o}
                                trigger={<Button size="sm">Place candidate</Button>}
                              />
                            )}
                            {(o.status === 'DRAFT' || o.status === 'NEGOTIATING') && (
                              <OfferFormDialog
                                applications={applications}
                                currencies={currencies}
                                existing={o}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    <Pencil className="mr-1.5 size-3.5" aria-hidden /> Edit terms
                                  </Button>
                                }
                              />
                            )}
                            {(OFFER_NEXT[o.status] ?? []).map((to) => (
                              <OfferTransitionDialog
                                key={to}
                                offer={o}
                                to={to}
                                trigger={
                                  <Button
                                    size="sm"
                                    variant={
                                      to === 'ACCEPTED' || to === 'SENT' ? 'default' : 'outline'
                                    }
                                  >
                                    {OFFER_ACTION_LABEL[to]}
                                  </Button>
                                }
                              />
                            ))}
                          </div>
                        )}
                        {o.status === 'ACCEPTED' && placed && (
                          <Link
                            href="?tab=seats"
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                          >
                            See the seat on Seats &amp; placements{' '}
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
