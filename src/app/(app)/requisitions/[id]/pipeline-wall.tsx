'use client';

import { differenceInYears } from 'date-fns';
import {
  ArrowRight,
  Ban,
  Briefcase,
  ChevronRight,
  Coins,
  Eye,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Sparkles,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { MetaRow } from '@/components/meta-row';
import { Note } from '@/components/note';
import { PIPELINE_STAGES, PipelineChip, type PipelineStage } from '@/components/pipeline-chip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatCurrency } from '@/lib/currency';
import { toastResult } from '@/lib/toast-result';
import { cn } from '@/lib/utils';
import { createApplicationAction, updateApplicationStatusAction } from '@/modules/applications/actions';
import { dismissMatchAction, shortlistMatchAction } from '@/modules/matching/actions';
import type { PipelineData, PipelineEntry, PipelineStageKey } from '@/modules/pipeline/service';
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
 * Each band uses its pipeline-{stage} tone via the `Note` component
 * so the wall reads as a stack of sticky notes. Every card carries
 * an "Advance to next stage" action inline; drag-and-drop is a
 * future addition, not required for the primary workflow.
 *
 * Bands with zero cards render a slim empty prompt so the wall keeps
 * its rhythm and staff always see where every stage sits.
 */
export function PipelineWall({
  requisition,
  data,
}: {
  requisition: RequisitionListRow;
  data: PipelineData;
}) {
  const [, startTransition] = useTransition();
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null);

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
          toastResult(r, { success: `${entry.personName} shortlisted` });
        } else if (stage === 'review') {
          const r = await shortlistMatchAction(entry.entryId, requisition.id);
          toastResult(r, { success: `${entry.personName} shortlisted` });
        } else if (stage === 'shortlist') {
          const r = await createApplicationAction({
            jobRequisitionId: requisition.id,
            personId: entry.personId,
            cvDocumentInstanceId: '',
            notes: '',
          });
          toastResult(r, { success: `${entry.personName} promoted to Applied` });
        } else if (stage === 'apply') {
          const r = await updateApplicationStatusAction(
            { applicationId: entry.entryId, status: 'INTERVIEW' },
            requisition.id,
          );
          toastResult(r, { success: `${entry.personName} moved to Interview` });
        } else if (stage === 'interview') {
          const r = await updateApplicationStatusAction(
            { applicationId: entry.entryId, status: 'OFFER' },
            requisition.id,
          );
          toastResult(r, { success: `${entry.personName} moved to Offer` });
        } else if (stage === 'offer') {
          const r = await updateApplicationStatusAction(
            { applicationId: entry.entryId, status: 'ACCEPTED' },
            requisition.id,
          );
          toastResult(r, { success: `${entry.personName} offer accepted — create a placement` });
        }
      } finally {
        setBusyPersonId(null);
      }
    });
  };

  const dismiss = (stage: PipelineStageKey, entry: PipelineEntry) => {
    if (stage !== 'source' && stage !== 'review') return;
    setBusyPersonId(entry.personId);
    startTransition(async () => {
      try {
        const r = await dismissMatchAction(entry.entryId, requisition.id);
        toastResult(r, { success: `${entry.personName} dismissed` });
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
      <div className="glass-panel flex flex-wrap items-center gap-1.5 rounded-2xl p-2">
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
        />
      ))}
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
}: {
  stage: PipelineStageKey;
  entries: PipelineEntry[];
  requisition: RequisitionListRow;
  onAdvance: (stage: PipelineStageKey, entry: PipelineEntry) => void;
  onDismiss: (stage: PipelineStageKey, entry: PipelineEntry) => void;
  busyPersonId: string | null;
}) {
  const tone = BAND_TONE[stage];

  return (
    <Note tone={tone} as="section" className="overflow-hidden">
      <header className="flex items-center gap-2 border-b border-black/5 px-4 py-2.5">
        <PipelineChip stage={stage} variant="solid" />
        <span className="text-[11px] font-medium opacity-75">{entries.length} candidates</span>
      </header>
      {entries.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs opacity-70">
          {emptyMessage(stage)}
        </div>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-4">
          {entries.map((entry) => (
            <PipelineCard
              key={`${stage}-${entry.personId}`}
              stage={stage}
              requisition={requisition}
              entry={entry}
              onAdvance={() => onAdvance(stage, entry)}
              onDismiss={() => onDismiss(stage, entry)}
              disabled={busyPersonId === entry.personId}
            />
          ))}
        </div>
      )}
    </Note>
  );
}

/* ── Card ──────────────────────────────────────────────────────────── */

function PipelineCard({
  stage,
  entry,
  requisition,
  onAdvance,
  onDismiss,
  disabled,
}: {
  stage: PipelineStageKey;
  entry: PipelineEntry;
  requisition: RequisitionListRow;
  onAdvance: () => void;
  onDismiss: () => void;
  disabled: boolean;
}) {
  const initials = getInitials(entry.personName);
  const salaryLabel = formatSalary(requisition);
  const scoreLabel =
    entry.matchScore !== null && entry.matchScore >= 0 ? Math.round(entry.matchScore) : null;
  const advanceLabel = ADVANCE_LABEL[stage];
  const canDismiss = stage === 'source' || stage === 'review';

  return (
    <article
      className={cn(
        'glass-panel flex w-64 shrink-0 snap-start flex-col gap-2 rounded-xl p-3 transition-shadow',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
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
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
              <MapPin className="size-2.5 shrink-0" />
              <span className="truncate">{entry.personLocation}</span>
            </p>
          )}
        </div>
        {scoreLabel !== null && (
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full border-2 bg-card font-mono text-[10px] font-bold tabular-nums',
              scoreLabel >= 75
                ? 'border-pipeline-placed text-pipeline-placed'
                : scoreLabel >= 50
                  ? 'border-pipeline-review text-pipeline-review'
                  : 'border-border text-muted-foreground',
            )}
          >
            {scoreLabel}
          </span>
        )}
      </div>

      <ul className="space-y-0.5 text-[10px] text-muted-foreground">
        <MetaRow icon={<Briefcase />}>{requisition.title}</MetaRow>
        {salaryLabel && <MetaRow icon={<Coins />}>{salaryLabel}</MetaRow>}
        <MetaRow icon={<Sparkles />}>{requisition.employerName}</MetaRow>
      </ul>

      <div className="mt-auto flex items-center gap-1 border-t pt-2">
        <IconAction
          title="View profile"
          href={`/candidates/${entry.personId}`}
          icon={<Eye className="size-3" />}
        />
        <IconAction
          title="Email"
          href={entry.personEmail ? `mailto:${entry.personEmail}` : undefined}
          icon={<Mail className="size-3" />}
        />
        <IconAction
          title="Call"
          href={entry.personPhone ? `tel:${entry.personPhone}` : undefined}
          icon={<Phone className="size-3" />}
        />
        <button
          type="button"
          className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="More"
        >
          <MoreHorizontal className="size-3" />
        </button>
      </div>

      {advanceLabel && (
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
      )}
      {canDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          disabled={disabled}
          className="flex items-center justify-center gap-1 rounded-md border border-border/60 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <Ban className="size-3" /> Dismiss
        </button>
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

const BAND_TONE: Record<PipelineStageKey, Parameters<typeof Note>[0]['tone']> = {
  source: 'blue',
  review: 'yellow',
  shortlist: 'pink',
  apply: 'purple',
  interview: 'purple',
  offer: 'green',
  placed: 'green',
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
  offer: 'Mark Placed',
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

function formatSalary(r: RequisitionListRow): string | null {
  const currency = r.salaryCurrencyCode;
  const min = r.salaryMin;
  const max = r.salaryMax;
  if (!currency) return null;
  const opts = { maximumFractionDigits: 0 } as const;
  if (min && max) {
    return `${formatCurrency(min, currency, opts)} – ${formatCurrency(max, currency, opts)}`;
  }
  if (min) return `From ${formatCurrency(min, currency, opts)}`;
  return null;
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
