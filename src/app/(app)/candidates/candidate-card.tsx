'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Briefcase,
  Filter,
  Grid3x3,
  Mail,
  MapPin,
  Phone,
  User2,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';

import { MetaList, MetaRow } from '@/components/meta-row';
import { PipelineChip } from '@/components/pipeline-chip';
import { RingCounter } from '@/components/ring-counter';
import { StatusPill, type StatusTone } from '@/components/status-pill';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CandidateListRow } from '@/modules/candidates/repository';

/**
 * Candidate tile — mirrors RequisitionCard so /candidates ?view=grid
 * feels like a natural sibling of /requisitions ?view=grid. Same
 * skeleton (source-chip → status → title → meta → tags → counters →
 * dual-action footer), driven by design-system primitives (StatusPill,
 * PipelineChip, RingCounter, MetaRow, Note tones).
 */
export function CandidateCard({ candidate }: { candidate: CandidateListRow }) {
  const availability = availabilityTone(candidate.availabilityStatus);
  const lifecycle = lifecycleTone(candidate.lifecycleStatus);
  const initials = initialsFrom(candidate.fullName);
  const postedLabel = formatDistanceToNowStrict(new Date(candidate.createdAt), {
    addSuffix: true,
  });
  const activatedLabel = formatDistanceToNowStrict(new Date(candidate.activatedAt), {
    addSuffix: true,
  });

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 shadow-sm transition-shadow hover:shadow-md">
      {/* Header — source chip + availability status + created ago */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <PipelineChip stage="source" variant="solid" className="text-[10px] uppercase">
          Talent
        </PipelineChip>
        <StatusPill tone={availability.tone}>{availability.label}</StatusPill>
        <span className="ml-auto text-[10px] italic text-muted-foreground">
          added {postedLabel}
        </span>
      </div>

      {/* Title strip — avatar + name */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-note-blue text-xs font-semibold text-note-blue-ink"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight">{candidate.fullName}</h3>
            {candidate.email && (
              <p className="truncate text-[11px] text-muted-foreground">{candidate.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* Meta */}
      <MetaList className="px-4 pt-3">
        <MetaRow icon={<MapPin className="text-pipeline-source" />}>
          {candidate.currentCity ?? 'Location not set'}
        </MetaRow>
        {candidate.phone && (
          <MetaRow icon={<Phone className="text-pipeline-apply" />}>{candidate.phone}</MetaRow>
        )}
        <MetaRow icon={<UserCheck className="text-pipeline-review" />}>
          {candidate.assignedUserName ?? 'Unassigned'}
        </MetaRow>
        <MetaRow icon={<Briefcase className="text-pipeline-interview" />}>
          activated {activatedLabel}
        </MetaRow>
      </MetaList>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        <StatusPill tone={lifecycle.tone}>{lifecycle.label}</StatusPill>
        <StatusPill tone={availability.tone}>{availability.label.toLowerCase()}</StatusPill>
      </div>

      {/* Counters — placeholder cells until we wire per-candidate stats
          (applications, shortlists, interviews). Ring keeps parity with
          the requisition card so the grids line up visually. */}
      <div className="mt-3 grid grid-cols-3 gap-1 px-4">
        <RingCounter label="apps" value={0} tone="apply" />
        <RingCounter label="shortlists" value={0} tone="shortlist" />
        <RingCounter
          label="placed"
          value={candidate.availabilityStatus === 'PLACED' ? 1 : 0}
          tone="placed"
        />
      </div>

      {/* Footer actions — sticky-note tones, same shape as RequisitionCard */}
      <div className="mt-3 grid grid-cols-2 gap-0 border-t">
        <Link
          href={`/candidates/${candidate.personId}`}
          className="group flex items-center justify-center gap-1.5 bg-note-green py-2.5 text-xs font-semibold text-note-green-ink transition-all hover:brightness-95"
        >
          <User2 className="size-3.5" /> profile
          <ArrowRight className="size-3 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href={`/candidates/${candidate.personId}?tab=applications`}
          className="group flex items-center justify-center gap-1.5 bg-note-pink py-2.5 text-xs font-semibold text-note-pink-ink transition-all hover:brightness-95"
        >
          <Mail className="size-3.5" /> reach
          <ArrowRight className="size-3 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Card>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function availabilityTone(a: CandidateListRow['availabilityStatus']): {
  tone: StatusTone;
  label: string;
} {
  switch (a) {
    case 'AVAILABLE':
      return { tone: 'success', label: 'available' };
    case 'TEMPORARILY_UNAVAILABLE':
      return { tone: 'warning', label: 'unavailable' };
    case 'PLACED':
      return { tone: 'info', label: 'placed' };
  }
}

function lifecycleTone(l: CandidateListRow['lifecycleStatus']): {
  tone: StatusTone;
  label: string;
} {
  switch (l) {
    case 'ACTIVE':
      return { tone: 'success', label: 'active' };
    case 'INACTIVE':
      return { tone: 'neutral', label: 'inactive' };
    case 'ARCHIVED':
      return { tone: 'neutral', label: 'archived' };
  }
}

function initialsFrom(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/* ── Grid + toggle ────────────────────────────────────────────────────── */

export function CandidatesCardGrid({ candidates }: { candidates: CandidateListRow[] }) {
  if (candidates.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <User2 className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium">No candidates to display</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Change the filters at the top of the page, or add a new candidate.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {candidates.map((c) => (
        <CandidateCard key={c.candidateProfileId} candidate={c} />
      ))}
    </div>
  );
}

export function CandidatesViewToggle({ current }: { current: 'grid' | 'table' }) {
  const isGrid = current === 'grid';
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      <Link
        href="?view=grid"
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors',
          isGrid
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
        aria-pressed={isGrid}
      >
        <Grid3x3 className="size-3" /> Cards
      </Link>
      <Link
        href="?view=table"
        className={cn(
          'flex items-center gap-1 border-l px-2.5 py-1 text-xs font-medium transition-colors',
          !isGrid
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
        aria-pressed={!isGrid}
      >
        <Filter className="size-3" /> Table
      </Link>
    </div>
  );
}
