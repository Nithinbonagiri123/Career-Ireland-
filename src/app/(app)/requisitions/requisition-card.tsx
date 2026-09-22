'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Briefcase,
  Calendar,
  Coins,
  Filter,
  Grid3x3,
  MapPin,
  Share2,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { MetaList, MetaRow } from '@/components/meta-row';
import { PipelineChip } from '@/components/pipeline-chip';
import { RingCounter } from '@/components/ring-counter';
import { StatusPill, type StatusTone } from '@/components/status-pill';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { RequisitionCardRow } from '@/modules/requisitions/service';

/**
 * Vacancy tile card. Rebuilt on top of the design-system tokens:
 *
 *   - StatusPill      → status-* semantic colours
 *   - PipelineChip    → source stage colour (Direct)
 *   - RingCounter     → pipeline-* stage colours for matched / applied / shortlisted
 *   - Note tone       → soft-tinted footer bar (yellow ink on yellow)
 *   - MetaRow         → icon + label rows
 *   - Card / Note     → surfaces from tokens, not raw hues
 *
 * The only colour classes in this file are `bg-note-{tone}` /
 * `text-note-{tone}-ink` and the status/pipeline tokens routed
 * through the primitives. No raw `bg-amber-300`, `bg-teal-400`, etc.
 */
export function RequisitionCard({ requisition }: { requisition: RequisitionCardRow }) {
  const { tone, label } = statusToTone(requisition.status);
  const employmentLabel = employmentTypeLabel(requisition.employmentType);
  const flag = countryFlag(requisition.location);
  const salaryLabel = formatSalary(requisition);
  const targetLabel = requisition.targetFillDate ? formatDate(requisition.targetFillDate) : null;
  const postedLabel = formatDistanceToNowStrict(new Date(requisition.createdAt), {
    addSuffix: true,
  });
  const descSnippet = trimDescription(requisition.description);

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 shadow-sm transition-shadow hover:shadow-md">
      {/* Header row: source + status + posted */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <PipelineChip stage="source" variant="solid" className="text-[10px] uppercase">
          Direct
        </PipelineChip>
        <StatusPill tone={tone}>{label}</StatusPill>
        <span className="ml-auto text-[10px] italic text-muted-foreground">
          posted {postedLabel}
        </span>
      </div>

      {/* Title strip */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-base font-semibold leading-tight">{requisition.title}</h3>
          {flag && (
            <span aria-hidden className="text-sm">
              {flag}
            </span>
          )}
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-accent transition-colors hover:bg-accent/10"
          aria-label="Share"
        >
          <Share2 className="size-3.5" />
        </button>
      </div>

      {/* Meta */}
      <MetaList className="px-4 pt-2">
        {salaryLabel && (
          <MetaRow icon={<Coins className="text-pipeline-placed" />}>{salaryLabel}</MetaRow>
        )}
        <MetaRow icon={<MapPin className="text-pipeline-source" />}>
          {requisition.location ?? 'Location not set'}
        </MetaRow>
        <MetaRow icon={<Users className="text-pipeline-review" />}>
          {requisition.positionsFilled} of {requisition.positionsRequired} filled
        </MetaRow>
        {targetLabel && (
          <MetaRow icon={<Calendar className="text-pipeline-interview" />}>{targetLabel}</MetaRow>
        )}
      </MetaList>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-3">
        <StatusPill tone="warning">{employmentLabel}</StatusPill>
        <StatusPill tone="info">in-office</StatusPill>
        {requisition.occupationCategory && (
          <StatusPill tone="neutral">{requisition.occupationCategory.toLowerCase()}</StatusPill>
        )}
      </div>

      {/* Description */}
      {descSnippet && (
        <p className="mt-2 line-clamp-3 px-4 text-[11px] leading-relaxed text-muted-foreground">
          {descSnippet}
        </p>
      )}

      {/* Ring counters — colour-coded to their pipeline stage */}
      <div className="mt-3 grid grid-cols-3 gap-1 px-4">
        <RingCounter label="matched" value={requisition.matchedCount} tone="source" />
        <RingCounter label="applied" value={requisition.appliedCount} tone="apply" />
        <RingCounter label="shortlisted" value={requisition.shortlistedCount} tone="shortlist" />
      </div>

      {/* Footer actions — sticky-note tones */}
      <div className="mt-3 grid grid-cols-2 gap-0 border-t">
        <Link
          href={`/requisitions/${requisition.id}`}
          className="group flex items-center justify-center gap-1.5 bg-note-green py-2.5 text-xs font-semibold text-note-green-ink transition-all hover:brightness-95"
        >
          <Grid3x3 className="size-3.5" /> manage
          <ArrowRight className="size-3 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href={`/requisitions/${requisition.id}?tab=pipeline`}
          className="group flex items-center justify-center gap-1.5 bg-note-pink py-2.5 text-xs font-semibold text-note-pink-ink transition-all hover:brightness-95"
        >
          <Filter className="size-3.5" /> track
          <ArrowRight className="size-3 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </Card>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function statusToTone(status: RequisitionCardRow['status']): {
  tone: StatusTone;
  label: string;
} {
  switch (status) {
    case 'DRAFT':
      return { tone: 'neutral', label: 'draft' };
    case 'OPEN':
      return { tone: 'info', label: 'open' };
    case 'IN_PROGRESS':
      return { tone: 'warning', label: 'review' };
    case 'PARTIALLY_FILLED':
      return { tone: 'warning', label: 'partial' };
    case 'FILLED':
      return { tone: 'success', label: 'filled' };
    case 'CLOSED':
    case 'CANCELLED':
      return { tone: 'neutral', label: status.toLowerCase() };
  }
}

function employmentTypeLabel(t: RequisitionCardRow['employmentType']): string {
  switch (t) {
    case 'FULL_TIME':
      return 'permanent';
    case 'PART_TIME':
      return 'part-time';
    case 'CONTRACT':
      return 'contract';
    case 'TEMP':
      return 'temp';
  }
}

function countryFlag(location: string | null): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  if (lower.includes('ireland') || lower.includes(', ie')) return '🇮🇪';
  if (lower.includes('south africa')) return '🇿🇦';
  if (lower.includes('india')) return '🇮🇳';
  if (lower.includes('nigeria')) return '🇳🇬';
  if (lower.includes('united kingdom') || lower.includes(', uk')) return '🇬🇧';
  return null;
}

function formatSalary(r: RequisitionCardRow): string | null {
  const currency = r.salaryCurrencyCode;
  const min = r.salaryMin;
  const max = r.salaryMax;
  if (!currency) return null;
  const opts = { maximumFractionDigits: 0 } as const;
  if (min && max) {
    return `${formatCurrency(min, currency, opts)} to ${formatCurrency(max, currency, opts)} per month`;
  }
  if (min) return `From ${formatCurrency(min, currency, opts)} per month`;
  if (max) return `Up to ${formatCurrency(max, currency, opts)} per month`;
  return null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function trimDescription(desc: string | null): string | null {
  if (!desc) return null;
  const clean = desc.replace(/\s+/g, ' ').trim();
  if (clean.length <= 150) return clean;
  return `${clean.slice(0, 147)}…`;
}

/* ── Grid + toggle ────────────────────────────────────────────────────── */

export function RequisitionsCardGrid({ requisitions }: { requisitions: RequisitionCardRow[] }) {
  if (requisitions.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <Briefcase className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium">No requisitions to display</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Change the filters at the top of the page, or create a new requisition to get started.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {requisitions.map((r) => (
        <RequisitionCard key={r.id} requisition={r} />
      ))}
    </div>
  );
}

export function RequisitionsViewToggle({ current }: { current: 'grid' | 'table' }) {
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
