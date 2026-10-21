'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  ClipboardList,
  Grid3x3,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Table2,
  User2,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { EmptyState } from '@/components/empty-state';
import { OwnerAvatar } from '@/components/owner-avatar';
import { StatusPill, type StatusTone } from '@/components/status-pill';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { flagEmojiFromCountryName, flagEmojiFromNationality } from '@/lib/iso-countries';
import { cn } from '@/lib/utils';
import type { CandidateListRow } from '@/modules/candidates/repository';

/**
 * Stage 6G Screen 03 — Candidate card, matching the approved mockup
 * exactly: avatar + status pill + added-ago + overflow menu on top,
 * name + profession, single-column meta rows (location / phone /
 * email), a flag-plus-nationality row with the assigned chip, a
 * three-column Applications / Shortlists / Placed counter strip, and
 * an "Open profile" + "Reach out" footer.
 */
export function CandidateCard({ candidate }: { candidate: CandidateListRow }) {
  const status = cardStatus(candidate);
  const initials = initialsFrom(candidate.fullName);
  const addedLabel = formatDistanceToNowStrict(new Date(candidate.activatedAt), {
    addSuffix: true,
  });
  const activatedAbsolute = format(new Date(candidate.activatedAt), 'd MMM yyyy · HH:mm');
  const nationalityFlag =
    flagEmojiFromNationality(candidate.nationality) ||
    flagEmojiFromCountryName(candidate.nationality);

  return (
    <article
      className="flex h-full flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      aria-label={`Candidate ${candidate.fullName}`}
    >
      {/* Top block — avatar left; pill + name + profession right; the
          added-ago timestamp and overflow menu pinned top-right. */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* Two-word labels ("In progress") must not wrap inside the
                pill when the added-ago text is long. */}
            <StatusPill tone={status.tone} className="whitespace-nowrap">
              {status.label}
            </StatusPill>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              {/* Relative time drifts between server render and hydration
                  ("51 seconds ago" vs "52") — suppress the mismatch; the
                  datetime attr + absolute tooltip stay exact. */}
              <time
                suppressHydrationWarning
                dateTime={new Date(candidate.activatedAt).toISOString()}
                title={activatedAbsolute}
              >
                {addedLabel}
              </time>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`More actions for ${candidate.fullName}`}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreVertical className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    render={
                      <Link href={`/clients/${candidate.personId}?tab=applications`}>
                        <ClipboardList className="mr-1.5 size-4" aria-hidden />
                        Open applications
                      </Link>
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
          <h3
            className="mt-1.5 truncate text-[15px] font-semibold leading-tight text-foreground"
            title={candidate.fullName}
          >
            {candidate.fullName}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {candidate.primaryOccupationName ?? <span className="italic">No profession set</span>}
          </p>
        </div>
      </div>

      {/* Meta rows — one per line like the mockup: location, phone,
          email, then flag + nationality with the assigned chip right. */}
      <div className="mt-3.5 space-y-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-3.5 shrink-0 text-sky-500" aria-hidden />
          <span className="truncate text-foreground/80" title={locationLabel(candidate)}>
            {locationLabel(candidate) || <span className="italic">Location not set</span>}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Phone className="size-3.5 shrink-0 text-sky-500" aria-hidden />
          <span className="truncate text-foreground/80">
            {candidate.phone ?? <span className="italic">No phone</span>}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="size-3.5 shrink-0 text-sky-500" aria-hidden />
          <span className="truncate text-foreground/80">
            {candidate.email ?? <span className="italic">No email</span>}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {candidate.nationality ? (
              <>
                {nationalityFlag && (
                  <span aria-hidden className="text-sm leading-none">
                    {nationalityFlag}
                  </span>
                )}
                <span className="truncate text-foreground/80">{candidate.nationality}</span>
              </>
            ) : (
              <span className="italic">Nationality not set</span>
            )}
          </span>
          <span className="flex shrink-0 items-center">
            {candidate.assignedUserId && candidate.assignedUserName ? (
              <OwnerAvatar
                user={{ id: candidate.assignedUserId, fullName: candidate.assignedUserName }}
                size="sm"
                showName
              />
            ) : (
              <span className="flex items-center gap-1.5">
                <User2 className="size-3.5" aria-hidden /> Unassigned
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Counter strip — Applications / Shortlists / Placed, divided
          columns per the mockup. Zero renders as a quiet 0: zero IS
          the fact. */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-3 text-center">
        <CounterCell n={candidate.applicationsCount} label="Applications" />
        <CounterCell n={candidate.shortlistsCount} label="Shortlists" />
        <CounterCell n={candidate.placementsCount} label="Placed" />
      </div>

      {/* Footer — "Open profile" + "Reach out" per the mockup. mt-auto
          keeps footers aligned across a row of cards. */}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-3.5">
        <Link
          href={`/clients/${candidate.personId}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          aria-label={`Open profile for ${candidate.fullName}`}
        >
          <User2 className="size-3.5" aria-hidden /> Open profile
        </Link>
        {candidate.email ? (
          <a
            href={`mailto:${candidate.email}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-100 py-2 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-200"
            aria-label={`Reach out to ${candidate.fullName}`}
          >
            <Mail className="size-3.5" aria-hidden /> Reach out
          </a>
        ) : (
          <span
            className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-muted py-2 text-xs font-medium text-muted-foreground"
            title="No email on file"
          >
            <Mail className="size-3.5" aria-hidden /> Reach out
          </span>
        )}
      </div>
    </article>
  );
}

function CounterCell({ n, label }: { n: number; label: string }) {
  return (
    <div className="min-w-0 px-1">
      <p className="text-sm font-semibold tabular-nums text-foreground">{n}</p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function locationLabel(c: CandidateListRow): string {
  return [c.currentCity, c.currentCountry].filter(Boolean).join(', ');
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * The mockup's card pill mixes availability with assignment:
 * AVAILABLE / PLACED / UNAVAILABLE by availability, except an
 * unassigned active candidate reads UNASSIGNED (warning) — mirroring
 * the hero stat band. Archived/inactive lifecycle takes precedence.
 */
function cardStatus(c: CandidateListRow): { tone: StatusTone; label: string } {
  if (c.lifecycleStatus === 'ARCHIVED') return { tone: 'neutral', label: 'Archived' };
  if (c.lifecycleStatus === 'INACTIVE') return { tone: 'neutral', label: 'Inactive' };
  if (!c.assignedUserId && c.availabilityStatus === 'AVAILABLE') {
    return { tone: 'warning', label: 'Unassigned' };
  }
  switch (c.availabilityStatus) {
    case 'AVAILABLE':
      // Stage B Wave 3 — an available active candidate surfaces their
      // Candidate Services progress (live/completed engagements) instead
      // of the bare "Available". Placed stays driven by availability
      // below — that value is Recruitment's, never written by CS.
      if (c.csProgressStatus === 'IN_PROGRESS') return { tone: 'info', label: 'In progress' };
      if (c.csProgressStatus === 'COMPLETED') return { tone: 'success', label: 'Completed' };
      return { tone: 'success', label: 'Available' };
    case 'TEMPORARILY_UNAVAILABLE':
      return { tone: 'warning', label: 'Unavailable' };
    case 'PLACED':
      return { tone: 'info', label: 'Placed' };
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
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const statusValues = useMemo(
    () =>
      (params.get('status') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );
  const countryValues = useMemo(
    () =>
      (params.get('country') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );
  const assigneeIds = useMemo(
    () =>
      (params.get('assignee') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );

  const sort = params.get('sort') ?? 'recent';

  const filtered = useMemo(() => {
    const list = candidates.filter((c) => {
      if (q) {
        const hay = `${c.fullName} ${c.email ?? ''} ${c.primaryOccupationName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusValues.length > 0) {
        const matches =
          statusValues.includes(c.availabilityStatus) ||
          statusValues.includes(c.lifecycleStatus) ||
          // Stage B Wave 3 — derived CS progress statuses are filterable
          // alongside availability/lifecycle ("IN_PROGRESS", "COMPLETED").
          (c.csProgressStatus !== null && statusValues.includes(c.csProgressStatus));
        if (!matches) return false;
      }
      if (countryValues.length > 0 && !countryValues.includes(c.currentCountry ?? '')) {
        return false;
      }
      if (assigneeIds.length > 0 && !assigneeIds.includes(c.assignedUserId ?? '')) {
        return false;
      }
      return true;
    });
    // "Recently added" is the server order (activatedAt desc); "Name A–Z"
    // re-sorts client-side per the mockup's Sort by control.
    if (sort === 'name') {
      return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    return list;
  }, [candidates, q, statusValues, countryValues, assigneeIds, sort]);

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
  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={User2}
        title="No candidates match the current filters"
        description="Try clearing a filter chip above or widening the scope."
      />
    );
  }
  // Responsive grid: 1 column on mobile, 2 on tablet, 3 on laptop.
  // items-stretch keeps rows uniform height even when some cards have
  // longer names than others.
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filtered.map((c) => (
        <CandidateCard key={c.candidateProfileId} candidate={c} />
      ))}
    </div>
  );
}

export function CandidatesViewToggle({ current }: { current: 'grid' | 'table' }) {
  const isGrid = current === 'grid';
  return (
    <div className="inline-flex overflow-hidden rounded-lg border bg-background">
      <Link
        href="?view=grid"
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
          isGrid
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
        aria-pressed={isGrid}
      >
        <Grid3x3 className="size-3.5" /> Cards
      </Link>
      <Link
        href="?view=table"
        className={cn(
          'flex items-center gap-1.5 border-l px-3 py-1.5 text-xs font-medium transition-colors',
          !isGrid
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
        aria-pressed={!isGrid}
      >
        <Table2 className="size-3.5" /> Table
      </Link>
    </div>
  );
}

/**
 * Stage 6G Screen 03 — status tab row + Sort by, per the approved
 * mockup: "All n / Available n / Placed n / Unassigned n / Archived n"
 * pills above the card grid. Tabs map onto the existing filter params
 * (?status= client filter; Unassigned reuses the ?assigned=unassigned
 * server scope), so no new filtering machinery.
 */
export function CandidatesStatusTabs({
  counts,
}: {
  counts: { all: number; available: number; placed: number; unassigned: number; archived: number };
}) {
  const params = useSearchParams();
  const status = params.get('status') ?? '';
  const assigned = params.get('assigned') ?? '';

  const hrefWith = (overrides: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : '?';
  };

  const tabs: Array<{
    key: string;
    label: string;
    n: number;
    href: string;
    active: boolean;
    dot: string;
  }> = [
    {
      key: 'all',
      label: 'All',
      n: counts.all,
      href: hrefWith({ status: null, assigned: 'all' }),
      active: !status && assigned !== 'unassigned',
      dot: 'bg-sky-500',
    },
    {
      key: 'available',
      label: 'Available',
      n: counts.available,
      href: hrefWith({ status: 'AVAILABLE', assigned: 'all' }),
      active: status === 'AVAILABLE',
      dot: 'bg-status-success',
    },
    {
      key: 'placed',
      label: 'Placed',
      n: counts.placed,
      href: hrefWith({ status: 'PLACED', assigned: 'all' }),
      active: status === 'PLACED',
      dot: 'bg-amber-500',
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      n: counts.unassigned,
      href: hrefWith({ status: null, assigned: 'unassigned' }),
      active: !status && assigned === 'unassigned',
      dot: 'bg-rose-500',
    },
    {
      key: 'archived',
      label: 'Archived',
      n: counts.archived,
      href: hrefWith({ status: 'ARCHIVED', assigned: 'all' }),
      active: status === 'ARCHIVED',
      dot: 'bg-muted-foreground',
    },
  ];

  const sort = params.get('sort') ?? 'recent';

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <nav aria-label="Candidate status filter" className="flex flex-wrap items-center gap-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              t.active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {!t.active && <span aria-hidden className={cn('size-1.5 rounded-full', t.dot)} />}
            {t.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-[10px] tabular-nums',
                t.active ? 'bg-primary-foreground/20' : 'bg-muted',
              )}
            >
              {t.n}
            </span>
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span id="candidates-sort-label">Sort by</span>
        <nav
          aria-labelledby="candidates-sort-label"
          className="inline-flex overflow-hidden rounded-lg border bg-background"
        >
          <Link
            href={hrefWith({ sort: null })}
            className={cn(
              'px-2.5 py-1 font-medium transition-colors',
              sort === 'recent' ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
            )}
          >
            Recently added
          </Link>
          <Link
            href={hrefWith({ sort: 'name' })}
            className={cn(
              'border-l px-2.5 py-1 font-medium transition-colors',
              sort === 'name' ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
            )}
          >
            Name A–Z
          </Link>
        </nav>
      </div>
    </div>
  );
}
