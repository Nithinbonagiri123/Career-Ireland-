'use client';

import { differenceInYears } from 'date-fns';
import {
  ArrowRight,
  Ban,
  ChevronRight,
  Eye,
  Handshake,
  Mail,
  MapPin,
  Phone,
  PlaneTakeoff,
  Search,
  Send,
  Star,
  Target,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { PIPELINE_STAGES, PipelineChip, type PipelineStage } from '@/components/pipeline-chip';
import {
  PLACEMENT_OFFER_REQUIRED,
  PlacementExceptionDialog,
} from '@/components/placement-exception-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toastResult } from '@/lib/toast-result';
import { cn } from '@/lib/utils';
import {
  createApplicationAction,
  updateApplicationStatusAction,
} from '@/modules/applications/actions';
import { dismissMatchAction, shortlistMatchAction } from '@/modules/matching/actions';
import type { PipelineData, PipelineEntry, PipelineStageKey } from '@/modules/pipeline/service';
import { markApplicationPlacedAction } from '@/modules/placements/actions';
import type { RequisitionListRow } from '@/modules/requisitions/service';

/**
 * Pipeline Wall — the replacement for the scattered
 * Matches / Shortlist / Applications tabs on a requisition detail
 * page.
 *
 *   ┌ Stage stepper strip ───────────────────────────────────────────┐
 *   │ [ Matched 42 ] › [ Reviewed 3 ] › [ Shortlisted 1 ] › …      │
 *   └────────────────────────────────────────────────────────────────┘
 *   ┌ Matched · 42 ── show all ─────────────────────────────────────┐
 *   │  ┌ card ┐ ┌ card ┐ ┌ card ┐ ┌ card ┐ ┌ card ┐   … scroll →   │
 *   │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                 │
 *   └────────────────────────────────────────────────────────────────┘
 *   ┌ Reviewed · 3 ─────────────────────────────────────────────────┐
 *   ...
 *
 * Stage 6G — each stage is a white section card; its pipeline tone sits
 * on the numbered step marker and the count. Every card carries
 * an "Advance to next stage" action inline; drag-and-drop is a
 * future addition, not required for the primary workflow.
 *
 * Bands with zero cards render a slim empty prompt so the wall keeps
 * its rhythm and staff always see where every stage sits.
 */
export function PipelineWall({
  requisition,
  data,
  canMatch = true,
  canMoveApplications = true,
  canPlace = true,
}: {
  requisition: RequisitionListRow;
  data: PipelineData;
  /** R5 — shortlist / dismiss on matched + reviewed cards needs recruitment.matching
   *  and an open job (the server re-checks both). */
  canMatch?: boolean;
  /** R6 — moving applications (apply / interview / offer / decline) needs
   *  recruitment.requisitions; Mark placed needs recruitment.placements. */
  canMoveApplications?: boolean;
  canPlace?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null);
  const [exceptionFor, setExceptionFor] = useState<PipelineEntry | null>(null);
  const router = useRouter();

  const totals = useMemo(
    () => STAGE_ORDER.map((stage) => ({ stage, count: data[stage].length })),
    [data],
  );

  const advance = (stage: PipelineStageKey, entry: PipelineEntry) => {
    setBusyPersonId(entry.personId);
    startTransition(async () => {
      try {
        if (stage === 'source') {
          const r = await shortlistMatchAction(entry.entryId, requisition.id);
          if (toastResult(r, { success: `${entry.personName} shortlisted` })) router.refresh();
        } else if (stage === 'review') {
          const r = await shortlistMatchAction(entry.entryId, requisition.id);
          if (toastResult(r, { success: `${entry.personName} shortlisted` })) router.refresh();
        } else if (stage === 'shortlist') {
          const r = await createApplicationAction({
            jobRequisitionId: requisition.id,
            personId: entry.personId,
            cvDocumentInstanceId: '',
            notes: '',
          });
          if (toastResult(r, { success: `${entry.personName} promoted to Applied` }))
            router.refresh();
        } else if (stage === 'apply') {
          const r = await updateApplicationStatusAction(
            { applicationId: entry.entryId, status: 'INTERVIEW' },
            requisition.id,
          );
          if (toastResult(r, { success: `${entry.personName} moved to Interview` }))
            router.refresh();
        } else if (stage === 'interview') {
          const r = await updateApplicationStatusAction(
            { applicationId: entry.entryId, status: 'OFFER' },
            requisition.id,
          );
          if (toastResult(r, { success: `${entry.personName} moved to Offer` })) router.refresh();
        } else if (stage === 'offer') {
          // Atomically: mark application ACCEPTED + create a CONFIRMED
          // placement + flip candidate availability to PLACED + recompute
          // requisition fill count. One click, everything consistent.
          // No offer accepted in the CRM → ask for the audited exception
          // instead of failing (external recruitment hires).
          const r = await markApplicationPlacedAction(entry.entryId);
          if (!r.ok && r.error.code === PLACEMENT_OFFER_REQUIRED) {
            setExceptionFor(entry);
          } else if (toastResult(r, { success: `${entry.personName} placed` })) {
            router.refresh();
          }
        }
      } finally {
        setBusyPersonId(null);
      }
    });
  };

  const dismiss = (stage: PipelineStageKey, entry: PipelineEntry) => {
    // Source + Review dismiss their matching rows; Offer stage dismisses
    // the application itself (declines/withdraws the offer). Keeping the
    // one `dismiss` entry point lets the card template stay dumb.
    if (stage === 'offer') {
      const reason = window.prompt(
        `Decline the offer to ${entry.personName}? Add a reason (audited):`,
        '',
      );
      if (reason === null) return; // user cancelled
      setBusyPersonId(entry.personId);
      startTransition(async () => {
        try {
          const r = await updateApplicationStatusAction(
            {
              applicationId: entry.entryId,
              status: 'REJECTED',
              rejectionReason: reason.trim() || undefined,
            },
            requisition.id,
          );
          if (toastResult(r, { success: `Offer to ${entry.personName} declined` }))
            router.refresh();
        } finally {
          setBusyPersonId(null);
        }
      });
      return;
    }
    if (stage !== 'source' && stage !== 'review') return;
    setBusyPersonId(entry.personId);
    startTransition(async () => {
      try {
        const r = await dismissMatchAction(entry.entryId, requisition.id);
        if (toastResult(r, { success: `${entry.personName} dismissed` })) router.refresh();
      } catch (e) {
        toast.error((e as Error).message ?? 'Could not dismiss match');
      } finally {
        setBusyPersonId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Stepper strip ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
        {totals.map(({ stage, count }, i) => (
          <div key={stage} className="flex items-center gap-1.5">
            <PipelineChip stage={stage} count={count} />
            {i < totals.length - 1 && (
              <ChevronRight className="size-3 shrink-0 text-foreground/40" />
            )}
          </div>
        ))}
      </div>

      {/* ── Bands ─────────────────────────────────────────────── */}
      {STAGE_ORDER.map((stage) => (
        <PipelineBand
          key={stage}
          stage={stage}
          entries={data[stage]}
          requisition={requisition}
          onAdvance={advance}
          onDismiss={dismiss}
          busyPersonId={busyPersonId}
          canAdvance={
            stage === 'source' || stage === 'review'
              ? canMatch
              : stage === 'offer'
                ? canPlace
                : canMoveApplications
          }
          canDismiss={
            stage === 'source' || stage === 'review'
              ? canMatch
              : stage === 'offer'
                ? canMoveApplications
                : false
          }
        />
      ))}

      <PlacementExceptionDialog
        open={exceptionFor !== null}
        onOpenChange={(open) => {
          if (!open) setExceptionFor(null);
        }}
        personName={exceptionFor?.personName ?? ''}
        successMessage={`${exceptionFor?.personName ?? 'Candidate'} placed`}
        onSubmit={(exception) =>
          markApplicationPlacedAction(exceptionFor?.entryId ?? '', exception)
        }
        onPlaced={() => router.refresh()}
      />
    </div>
  );
}

/* ── Band ──────────────────────────────────────────────────────────── */

function PipelineBand({
  stage,
  entries,
  requisition,
  onAdvance,
  onDismiss,
  busyPersonId,
  canAdvance,
  canDismiss,
}: {
  stage: PipelineStageKey;
  entries: PipelineEntry[];
  requisition: RequisitionListRow;
  onAdvance: (stage: PipelineStageKey, entry: PipelineEntry) => void;
  onDismiss: (stage: PipelineStageKey, entry: PipelineEntry) => void;
  busyPersonId: string | null;
  canAdvance: boolean;
  canDismiss: boolean;
}) {
  const tone = BAND_TONE[stage];

  const stageIndex = STAGE_ORDER.indexOf(stage) + 1;
  const Icon = STAGE_ICON[stage];
  const label = PIPELINE_STAGES[stage].label;

  return (
    // Stage 6G — white section card; the stage colour lives in the step
    // marker only, so seven stages no longer stack seven colour bands.
    <section
      aria-label={`${label} (${entries.length})`}
      className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
    >
      {/* Session 36 — band header gets a step number + stage icon so
          the funnel is readable at a glance. The old header duplicated
          the stepper strip above; this version uses the extra space
          to show the stage name prominently and the count as support. */}
      <header
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3',
          entries.length > 0 && 'border-b border-border/60',
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-semibold tabular-nums',
              DS_SOFT[tone],
            )}
          >
            {stageIndex}
          </span>
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {entries.length === 0 && (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              · {emptyMessage(stage)}
            </span>
          )}
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
            entries.length > 0 ? DS_SOFT[tone] : 'bg-muted text-muted-foreground',
          )}
        >
          {entries.length}
        </span>
      </header>
      {entries.length === 0 ? null : (
        // The band scrolls horizontally when it has more candidates than
        // fit. Right-edge fade mask signals "there's more here" so users
        // don't miss offscreen cards. Mask sits behind the cards, so
        // pointer + tap targets aren't blocked. Only applied on
        // mobile/tablet — desktop viewports rarely need the cue since the
        // grid comfortably fits 3-4 cards.
        <div
          className={cn(
            'flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-4',
            'supports-[mask-image:linear-gradient(black,black)]:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent_100%)]',
            'supports-[mask-image:linear-gradient(black,black)]:lg:[mask-image:none]',
          )}
        >
          {entries.map((entry) => (
            <PipelineCard
              key={`${stage}-${entry.personId}`}
              stage={stage}
              requisition={requisition}
              entry={entry}
              onAdvance={() => onAdvance(stage, entry)}
              onDismiss={() => onDismiss(stage, entry)}
              disabled={busyPersonId === entry.personId}
              canAdvance={canAdvance}
              canDismissStage={canDismiss}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Card ──────────────────────────────────────────────────────────── */

function PipelineCard({
  stage,
  entry,
  onAdvance,
  onDismiss,
  disabled,
  canAdvance,
  canDismissStage,
}: {
  stage: PipelineStageKey;
  entry: PipelineEntry;
  requisition: RequisitionListRow;
  onAdvance: () => void;
  onDismiss: () => void;
  disabled: boolean;
  canAdvance: boolean;
  canDismissStage: boolean;
}) {
  const initials = getInitials(entry.personName);
  const scoreLabel =
    entry.matchScore !== null && entry.matchScore >= 0 ? Math.round(entry.matchScore) : null;
  const advanceLabel = canAdvance ? ADVANCE_LABEL[stage] : null;
  // Source + Review surface a "Dismiss match" button; Offer surfaces a
  // "Decline offer" button that calls the same onDismiss handler (the
  // handler branches on stage).
  const canDismiss =
    canDismissStage && (stage === 'source' || stage === 'review' || stage === 'offer');
  const dismissLabel =
    stage === 'offer' ? 'Decline offer' : stage === 'source' || stage === 'review' ? 'Dismiss' : '';

  return (
    <article
      className={cn(
        'group flex w-64 shrink-0 snap-start flex-col gap-2.5 rounded-xl border border-border/70 bg-card p-3 shadow-xs transition-shadow hover:shadow-md',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      {/* Session 36 — identity row: avatar / name / match score.
          Dropped the duplicated requisition meta rows (title, salary,
          employer) because the page itself IS one requisition and the
          page header already carries them. The reclaimed vertical
          space goes to the candidate's own contact rail. */}
      <div className="flex items-start gap-2">
        <Avatar className="size-10 rounded-lg bg-muted">
          <AvatarFallback className="rounded-lg text-xs font-semibold">
            {initials === '?' ? <User className="size-4" /> : initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link
            href={`/candidates/${entry.personId}`}
            className="block truncate text-sm font-semibold text-foreground hover:underline"
          >
            {entry.personName}
          </Link>
          {entry.personLocation && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{entry.personLocation}</span>
            </p>
          )}
        </div>
        {scoreLabel !== null && (
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border-2 bg-card font-mono text-[11px] font-bold tabular-nums',
              scoreLabel >= 75
                ? 'border-pipeline-placed text-pipeline-placed'
                : scoreLabel >= 50
                  ? 'border-pipeline-review text-pipeline-review'
                  : 'border-border text-muted-foreground',
            )}
            title={`Match score ${scoreLabel}`}
          >
            {scoreLabel}
          </span>
        )}
      </div>

      {/* Source-layer badge — Session 17 context. Promoted to its own
          row so the identity row above stays uncluttered. */}
      <div className="flex items-center gap-1.5 text-[10px]">
        <span
          className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 font-mono uppercase tracking-wide text-muted-foreground"
          title={`Backed by: ${SOURCE_LAYER_LABEL[stage]} record`}
        >
          {SOURCE_LAYER_LABEL[stage]}
        </span>
        {!entry.personEmail && !entry.personPhone && (
          <span className="text-muted-foreground/70 italic">No contact info</span>
        )}
      </div>

      {/* Contact rail — only emits actionable buttons for data we have.
          Previously four cells were always visible (view + email + phone
          + more); the "more" overflow button went nowhere and the
          disabled mail/phone cells read as broken. Removed. */}
      <div className="flex items-center gap-1 border-t pt-2">
        <IconAction
          title="View profile"
          href={`/candidates/${entry.personId}`}
          icon={<Eye className="size-3" />}
        />
        {entry.personEmail && (
          <IconAction
            title={`Email ${entry.personEmail}`}
            href={`mailto:${entry.personEmail}`}
            icon={<Mail className="size-3" />}
          />
        )}
        {entry.personPhone && (
          <IconAction
            title={`Call ${entry.personPhone}`}
            href={`tel:${entry.personPhone}`}
            icon={<Phone className="size-3" />}
          />
        )}
      </div>

      {advanceLabel && (
        <>
          <button
            type="button"
            onClick={onAdvance}
            disabled={disabled}
            className={cn(
              'flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-50',
              PIPELINE_STAGES[NEXT_STAGE[stage] ?? 'placed'].solidClassName,
            )}
          >
            {advanceLabel} <ArrowRight className="size-3" />
          </button>
          {ADVANCE_HINT[stage] && (
            <p className="text-center text-[9px] leading-tight text-muted-foreground">
              {ADVANCE_HINT[stage]}
            </p>
          )}
        </>
      )}
      {canDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className={cn(
            'flex items-center justify-center gap-1 rounded-md border py-1 text-[11px] font-medium disabled:opacity-50',
            stage === 'offer'
              ? 'border-destructive/40 text-destructive hover:bg-destructive/5'
              : 'border-border/60 text-muted-foreground hover:bg-muted',
          )}
        >
          <Ban className="size-3" /> {dismissLabel}
        </button>
      )}
      {stage === 'placed' && (
        <Link
          href={`/immigration?raisePlacement=${entry.entryId}`}
          className="flex items-center justify-center gap-1 rounded-md border border-border/60 py-1 text-[11px] font-medium text-muted-foreground hover:border-pipeline-placed/60 hover:text-pipeline-placed"
        >
          <PlaneTakeoff className="size-3" /> Raise immigration case
        </Link>
      )}
    </article>
  );
}

function IconAction({
  title,
  href,
  icon,
}: {
  title: string;
  href?: string;
  icon: React.ReactNode;
}) {
  const disabled = !href;
  const className = cn(
    'grid size-6 place-items-center rounded-md transition-colors',
    disabled
      ? 'bg-muted text-muted-foreground/40'
      : 'bg-muted text-muted-foreground hover:bg-foreground hover:text-background',
  );
  if (href) {
    return (
      <Link href={href} title={title} aria-label={title} className={className}>
        {icon}
      </Link>
    );
  }
  return (
    <span title={title} className={className} aria-disabled>
      {icon}
    </span>
  );
}

/* ── Constants + helpers ──────────────────────────────────────────── */

const STAGE_ORDER: PipelineStageKey[] = [
  'source',
  'review',
  'shortlist',
  'apply',
  'interview',
  'offer',
  'placed',
];

const BAND_TONE: Record<PipelineStageKey, DsTone> = {
  source: 'blue',
  review: 'amber',
  shortlist: 'rose',
  apply: 'violet',
  interview: 'violet',
  offer: 'teal',
  placed: 'green',
};

/**
 * Session 36 — one icon per band, picked for recognition at a glance.
 * The band header renders the icon alongside the step number so a
 * recruiter can land on the page and parse the funnel without reading.
 */
const STAGE_ICON: Record<PipelineStageKey, typeof Target> = {
  source: Target,
  review: Search,
  shortlist: Star,
  apply: Send,
  interview: Users,
  offer: Handshake,
  placed: UserCheck,
};

const NEXT_STAGE: Record<PipelineStageKey, PipelineStage | null> = {
  source: 'shortlist',
  review: 'shortlist',
  shortlist: 'apply',
  apply: 'interview',
  interview: 'offer',
  offer: 'placed',
  placed: null,
};

const ADVANCE_LABEL: Record<PipelineStageKey, string | null> = {
  source: 'Shortlist',
  review: 'Shortlist',
  shortlist: 'Promote to Applied',
  apply: 'Move to Interview',
  interview: 'Move to Offer',
  offer: 'Mark placed',
  placed: null,
};

/**
 * Phase 1 blueprint §1.1 — three different tables feed the pipeline:
 * candidateMatches, shortlistEntries, jobApplications (plus placements
 * as the terminal). Operators got confused because the pipeline wall
 * surfaced all four as "one funnel" with no indication of which
 * backing record a given card represented. Advancing a Shortlist card
 * created a NEW application row; advancing an Application card
 * UPDATED the existing one — same visible click, different DB effect.
 *
 * This badge is non-interactive; it just tells the operator which
 * "layer" they're acting on so advance moves aren't surprising.
 */
const SOURCE_LAYER_LABEL: Record<PipelineStageKey, string> = {
  source: 'Match',
  review: 'Match',
  shortlist: 'Shortlist',
  apply: 'Application',
  interview: 'Application',
  offer: 'Application',
  placed: 'Placement',
};

/**
 * Short sentence that spells out what the advance action actually
 * does, so an operator doesn't accidentally fire a different DB
 * mutation than they expected. Rendered as a sub-line under the
 * advance button.
 */
const ADVANCE_HINT: Record<PipelineStageKey, string | null> = {
  source: 'Moves to the manual shortlist.',
  review: 'Moves to the manual shortlist.',
  shortlist: 'Creates a formal application row.',
  apply: 'Updates application status to Interview.',
  interview: 'Updates application status to Offer.',
  offer: 'Marks the application as placed + creates a placement record.',
  placed: null,
};

function emptyMessage(stage: PipelineStageKey): string {
  switch (stage) {
    case 'source':
      return 'No unreviewed matches. Run assisted matching to source more.';
    case 'review':
      return 'Nothing under review right now.';
    case 'shortlist':
      return 'No shortlisted candidates yet.';
    case 'apply':
      return 'No open applications for this requisition.';
    case 'interview':
      return 'No interviews scheduled.';
    case 'offer':
      return 'No offers outstanding.';
    case 'placed':
      return 'No placements confirmed yet.';
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

// Age helper reserved for a future card variant. Kept close to
// initials so future contributors don't reach for date-fns.
export function candidateAge(dob: string | null): number | null {
  if (!dob) return null;
  try {
    return differenceInYears(new Date(), new Date(dob));
  } catch {
    return null;
  }
}
