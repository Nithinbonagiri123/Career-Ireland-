'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  Filter,
  Grid3x3,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User2,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/empty-state';
import { MetaList, MetaRow } from '@/components/meta-row';
import { OwnerAvatar } from '@/components/owner-avatar';
import { PipelineChip } from '@/components/pipeline-chip';
import { RingCounter } from '@/components/ring-counter';
import { StatusPill, type StatusTone } from '@/components/status-pill';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CandidateListRow } from '@/modules/candidates/repository';

/**
 * Candidate card — Stage 4.2 priority order:
 *   1. Candidate name + email
 *   2. Primary occupation (prominent, right under the name)
 *   3. Immigration permission / stamp (when available)
 *   4. Location + phone
 *   5. Assigned staff + activation date
 *   6. Apps / shortlists / placements counts (live, not placeholders)
 *   7. View Profile + Reach Out actions
 *   TALENT chip + availability status badge preserved in the header.
 *
 * Missing-data policy: a neutral placeholder ("No profession set",
 * "Immigration not on file") replaces the field — never inferred from
 * country or nationality. Long values truncate on a single line with
 * the title attribute exposing the full string on hover + for screen
 * readers.
 */
export function CandidateCard({ candidate }: { candidate: CandidateListRow }) {
  const availability = availabilityTone(candidate.availabilityStatus);
  const lifecycle = lifecycleTone(candidate.lifecycleStatus);
  const initials = initialsFrom(candidate.fullName);
  const postedLabel = formatDistanceToNowStrict(new Date(candidate.createdAt), {
    addSuffix: true,
  });
  const postedAbsolute = format(new Date(candidate.createdAt), 'd MMM yyyy · HH:mm');
  const activatedLabel = formatDistanceToNowStrict(new Date(candidate.activatedAt), {
    addSuffix: true,
  });
  const activatedAbsolute = format(new Date(candidate.activatedAt), 'd MMM yyyy · HH:mm');
  const immigrationExpiresAbsolute = candidate.immigrationExpiresOn
    ? format(new Date(candidate.immigrationExpiresOn), 'd MMM yyyy')
    : null;
  const immigrationStatusLabel = candidate.immigrationStatus
    ? candidate.immigrationStatus.toLowerCase().replaceAll('_', ' ')
    : null;
  // Status pill tone — used for PENDING_CASE / REJECTED_CASE / CLOSED_CASE
  // where we want to show the raw case status alongside the "Immigration
  // case:" label. CURRENT_PERMISSION / EXPIRED_PERMISSION have their own
  // headline treatment and don't use this pill.
  const caseStatusTone: StatusTone = (() => {
    switch (candidate.immigrationStatus) {
      case 'APPROVED':
        return 'success';
      case 'REJECTED':
        return 'danger';
      case 'CLOSED':
        return 'neutral';
      case 'SUBMITTED':
      case 'UNDER_AUTHORITY_REVIEW':
        return 'info';
      default:
        return 'warning';
    }
  })();

  return (
    <Card
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 shadow-sm transition-shadow hover:shadow-md"
      aria-label={`Candidate ${candidate.fullName}`}
    >
      {/* Header — TALENT chip + availability status + added timestamp.
          Stage 6E — tighter vertical padding; keeps all pills visible on
          one row at desktop + tablet widths. */}
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5">
        <PipelineChip stage="source" variant="solid" className="text-[10px] uppercase">
          Talent
        </PipelineChip>
        <StatusPill tone={availability.tone}>{availability.label}</StatusPill>
        {candidate.lifecycleStatus !== 'ACTIVE' && (
          <StatusPill tone={lifecycle.tone}>{lifecycle.label}</StatusPill>
        )}
        <time
          dateTime={new Date(candidate.createdAt).toISOString()}
          title={postedAbsolute}
          className="ml-auto text-[10px] italic text-muted-foreground"
        >
          added {postedLabel}
        </time>
      </div>

      {/* 1. Name + email — Stage 6E — reduced top padding so the name sits
          closer to the header. */}
      <div className="flex items-center gap-2.5 px-3.5 pt-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-note-blue text-xs font-semibold text-note-blue-ink"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-tight" title={candidate.fullName}>
            {candidate.fullName}
          </h3>
          {candidate.email ? (
            <p
              className="truncate text-[11px] leading-tight text-muted-foreground"
              title={candidate.email}
            >
              {candidate.email}
            </p>
          ) : (
            <p className="truncate text-[11px] italic leading-tight text-muted-foreground">
              no email on file
            </p>
          )}
        </div>
      </div>

      {/* 2. Primary occupation — Stage 6E — tightened margin and
          padding; the single-line truncation + hover-title pattern
          handles long occupation names gracefully. */}
      <div className="mx-3.5 mt-2 rounded-md border border-pipeline-interview/30 bg-pipeline-interview/5 px-2.5 py-1.5">
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 size-3.5 shrink-0 text-pipeline-interview" aria-hidden />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Primary occupation
            </div>
            {candidate.primaryOccupationName ? (
              <div
                className="truncate text-xs font-medium leading-snug"
                title={candidate.primaryOccupationName}
              >
                {candidate.primaryOccupationName}
              </div>
            ) : (
              <div className="text-[11px] italic text-muted-foreground">No profession set</div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Immigration — rendered differently per immigrationKind so
          a pending / rejected / closed case is NEVER presented as a
          currently-held permission. The schema can only establish a
          current permission reliably when status = APPROVED + expiry
          is in the future; everything else is labelled as a case.
          Expired permissions get a distinct destructive tone. */}
      {candidate.immigrationKind === 'CURRENT_PERMISSION' ? (
        <div className="mx-3.5 mt-1.5 rounded-md border border-status-success/40 bg-status-success-soft px-2.5 py-1.5">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-status-success">
                Current permission
              </div>
              <div
                className="truncate text-xs font-medium"
                title={candidate.immigrationPermitLabel ?? ''}
              >
                {candidate.immigrationPermitLabel}
              </div>
              {immigrationExpiresAbsolute && (
                <div
                  className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"
                  title={immigrationExpiresAbsolute}
                >
                  <CalendarCheck className="size-3" aria-hidden />
                  expires {immigrationExpiresAbsolute}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : candidate.immigrationKind === 'EXPIRED_PERMISSION' ? (
        <div className="mx-3.5 mt-1.5 rounded-md border border-status-danger/40 bg-status-danger-soft px-2.5 py-1.5">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-status-danger" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-status-danger">
                Expired permission
              </div>
              <div
                className="truncate text-xs font-medium"
                title={candidate.immigrationPermitLabel ?? ''}
              >
                {candidate.immigrationPermitLabel}
              </div>
              {immigrationExpiresAbsolute && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-status-danger">
                  <CalendarCheck className="size-3" aria-hidden />
                  expired {immigrationExpiresAbsolute}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : candidate.immigrationKind !== 'NONE' ? (
        <div className="mx-3.5 mt-1.5 rounded-md border bg-background px-2.5 py-1.5">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-pipeline-review" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Immigration case
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span
                  className="truncate text-xs font-medium"
                  title={candidate.immigrationPermitLabel ?? ''}
                >
                  {candidate.immigrationPermitLabel} application
                </span>
                {immigrationStatusLabel && (
                  <StatusPill tone={caseStatusTone}>{immigrationStatusLabel}</StatusPill>
                )}
              </div>
              <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                Not a currently-held permission.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-3.5 mt-1.5 rounded-md border bg-background px-2.5 py-1.5">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-pipeline-review" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Immigration
              </div>
              <div className="text-[12px] italic text-muted-foreground">
                Immigration not on file
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4+5. Location, phone, assigned staff, activation date.
          Stage 6E — tighter top padding; the MetaList itself handles
          per-row gap internally. */}
      <MetaList className="px-3.5 pt-2">
        <MetaRow icon={<MapPin className="text-pipeline-source" />}>
          {candidate.currentCity || candidate.currentCountry ? (
            [candidate.currentCity, candidate.currentCountry].filter(Boolean).join(', ')
          ) : (
            <span className="italic text-muted-foreground">Location not set</span>
          )}
        </MetaRow>
        {candidate.phone ? (
          <MetaRow icon={<Phone className="text-pipeline-apply" />}>{candidate.phone}</MetaRow>
        ) : (
          <MetaRow icon={<Phone className="text-pipeline-apply" />}>
            <span className="italic text-muted-foreground">No phone</span>
          </MetaRow>
        )}
        <MetaRow icon={<UserCheck className="text-pipeline-review" />}>
          <OwnerAvatar
            user={
              candidate.assignedUserId && candidate.assignedUserName
                ? { id: candidate.assignedUserId, fullName: candidate.assignedUserName }
                : null
            }
            size="sm"
            showName
          />
        </MetaRow>
        <MetaRow icon={<Briefcase className="text-pipeline-interview" />}>
          <time dateTime={new Date(candidate.activatedAt).toISOString()} title={activatedAbsolute}>
            activated {activatedLabel}
          </time>
        </MetaRow>
      </MetaList>

      {/* 6. Live counters. Stage 6E — tighter top gap; mt-auto pushes
          the counters + footer to the card's bottom so every card in a
          row ends at the same height (flex-col + h-full on <Card>
          already set the stage; this just claims the slack). */}
      <div className="mt-auto grid grid-cols-3 gap-1 px-3.5 pt-2">
        <RingCounter label="apps" value={candidate.applicationsCount} tone="apply" />
        <RingCounter label="shortlists" value={candidate.shortlistsCount} tone="shortlist" />
        <RingCounter label="placed" value={candidate.placementsCount} tone="placed" />
      </div>

      {/* 7. Dual-action footer. Stage 6E — reduced from py-2.5 to
          py-2 so the buttons stay prominent without the card gaining
          height. Bottom-aligned via `mt-auto` on the counters above. */}
      <div className="mt-2 grid grid-cols-2 gap-0 border-t">
        <Link
          href={`/clients/${candidate.personId}`}
          className="group flex items-center justify-center gap-1.5 bg-note-green py-2 text-xs font-semibold text-note-green-ink transition-all hover:brightness-95"
          aria-label={`Open workspace for ${candidate.fullName}`}
        >
          <User2 className="size-3.5" /> Open workspace
          <ArrowRight className="size-3 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href={`/clients/${candidate.personId}?tab=applications`}
          className="group flex items-center justify-center gap-1.5 bg-note-pink py-2 text-xs font-semibold text-note-pink-ink transition-all hover:brightness-95"
          aria-label={`Reach out to ${candidate.fullName}`}
        >
          <Mail className="size-3.5" /> Reach out
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
      <EmptyState
        icon={User2}
        title="No candidates yet"
        description="Candidates land here once a lead is accepted — automatically when payment is verified, or manually from the lead row."
        action={
          <Link href="/leads" className={buttonVariants({ size: 'sm' })}>
            Go to Leads <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        }
      />
    );
  }
  // Responsive grid: 1 column on mobile, 2 on tablet, 3 on laptop,
  // 4 on wide desktop. items-stretch keeps rows uniform height even
  // when some cards have an immigration block + others don't.
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
