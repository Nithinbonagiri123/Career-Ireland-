import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3, Plus, Target, Users } from 'lucide-react';
import Link from 'next/link';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { FadeUp } from '@/components/motion/motion-primitives';
import { ScopeFilter } from '@/components/scope-filter';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { cn } from '@/lib/utils';
import { fetchCandidates } from '@/modules/candidates/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CandidatesCardGrid, CandidatesStatusTabs, CandidatesViewToggle } from './candidate-card';
import { CandidatesInlineFilterBar } from './candidates-filter-bar';
import { CandidatesTable } from './candidates-table';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    assigned?: string;
    created?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  await requirePermission('candidate_services', 'candidates', 'view');
  const session = await requireInternalStaff();
  const { assigned, created, from, to, view } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  const currentView: 'grid' | 'table' = view === 'table' ? 'table' : 'grid';
  const [candidates, staffUsers, occupations] = await Promise.all([
    fetchCandidates(scope, createdRange),
    fetchStaffUserOptions(),
    fetchOccupations(),
  ]);

  const totalCount = candidates.length;
  const availableCount = candidates.filter((c) => c.availabilityStatus === 'AVAILABLE').length;
  const placedCount = candidates.filter((c) => c.availabilityStatus === 'PLACED').length;
  // Mockup's 4th KPI tile is "Unassigned — not assigned to staff".
  const unassignedCount = candidates.filter((c) => !c.assignedUserId).length;
  const archivedCount = candidates.filter((c) => c.lifecycleStatus === 'ARCHIVED').length;

  // Derived filter sources — assignees + nationalities seen in the
  // current result set so the chip dropdowns only offer values the
  // operator can actually match.
  const assigneeMap = new Map<string, string>();
  for (const c of candidates) {
    if (c.assignedUserId && c.assignedUserName && !assigneeMap.has(c.assignedUserId)) {
      assigneeMap.set(c.assignedUserId, c.assignedUserName);
    }
  }
  const assignees = Array.from(assigneeMap.entries())
    .map(([id, fullName]) => ({ id, fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const nationalities = Array.from(
    new Set(candidates.map((c) => c.currentCountry).filter((v): v is string => Boolean(v))),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="relative">
      {/* Stage 6G Screen 03 — soft-blue hero band matching the approved
          Candidates mockup. Hero carries the title + description + the
          two primary actions (Download CSV + Add candidate) + the 4 KPI
          tiles. Scope + view controls move into the inline filter row
          below. */}
      <section
        aria-label="Candidates header"
        className="relative overflow-hidden rounded-b-3xl bg-gradient-to-br from-sky-200/70 via-sky-100/40 to-background px-4 pb-6 pt-8 sm:px-6 md:px-10"
      >
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-note-blue text-note-blue-ink shadow-sm ring-1 ring-black/5"
              >
                <Users className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Candidates
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-foreground/70">
                  Active talent pool shared across Candidate Services and Recruitment — each person
                  is a single record. Click any card for the full profile.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <CsvExportButton href="/api/export/candidates" />
              <Link href="/candidates/new" className={buttonVariants({ size: 'default' })}>
                <Plus className="mr-1.5 size-4" />
                Add candidate
              </Link>
            </div>
          </div>

          {/* 4 KPI tiles — Total · Active · Placed · Unavailable. Same
              compact variant used on the Leads page (number dominant,
              label small, hint even smaller). */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              icon={Users}
              label="Total candidates"
              value={totalCount}
              hint="Every candidate on file"
              tone="blue"
            />
            <KpiTile
              icon={CheckCircle2}
              label="Available"
              value={availableCount}
              hint="Ready to be matched"
              tone="green"
            />
            <KpiTile
              icon={Target}
              label="Placed"
              value={placedCount}
              hint="On an active placement"
              tone="amber"
            />
            <KpiTile
              icon={Clock3}
              label="Unassigned"
              value={unassignedCount}
              hint="Not assigned to staff"
              tone="rose"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-5 sm:px-6 md:px-10">
        {/* Scope filter (mine / all / unassigned) + view toggle sit
            above the inline chip row so the operator can switch scope
            and layout without hunting through dropdowns. */}
        <FadeUp delay={0.03}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <ScopeFilter current={scope} />
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CandidatesViewToggle current={currentView} />
            </div>
          </div>
        </FadeUp>
        {/* Inline filter chip bar — Search + Status + Profession +
            Nationality + Assigned to + More Filters. Mirrors the
            Leads inline bar so the UX is consistent. */}
        <FadeUp delay={0.04}>
          <CandidatesInlineFilterBar
            countries={nationalities}
            occupations={occupations.map((o) => ({ id: o.id, name: o.name }))}
            assignees={assignees}
          />
        </FadeUp>

        {scope === 'mine' && candidates.length === 0 && (
          <FadeUp delay={0.06}>
            <EmptyMineNudge resourceLabel="candidates" seeAllHref="/candidates?assigned=all" />
          </FadeUp>
        )}
        {/* Mockup status tab row — All / Available / Placed / Unassigned /
            Archived with live counts + the Sort by control. */}
        <FadeUp delay={0.06}>
          <div className="mt-4">
            <CandidatesStatusTabs
              counts={{
                all: totalCount,
                available: availableCount,
                placed: placedCount,
                unassigned: unassignedCount,
                archived: archivedCount,
              }}
            />
          </div>
        </FadeUp>
        <FadeUp delay={0.08}>
          <div className="mt-4">
            {currentView === 'grid' ? (
              <CandidatesCardGrid candidates={candidates} />
            ) : (
              <CandidatesTable
                candidates={candidates}
                staffUsers={staffUsers.map((u) => ({
                  id: u.id,
                  fullName: u.fullName,
                  email: u.email,
                }))}
              />
            )}
          </div>
        </FadeUp>
        {/* Silence unused — session is retained because future
            per-row ownership chips will need it. */}
        <span className="hidden">{session.user.id}</span>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<'blue' | 'green' | 'amber' | 'rose', string> = {
  blue: 'bg-sky-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-500 text-white',
  rose: 'bg-rose-500 text-white',
};

/**
 * Stage 6G Screen 03 — compact KPI tile. Icon medallion on the left,
 * big number + small label on the right, hint underneath. Same shape
 * as the Leads page tile for consistency.
 */
function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'rose';
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/90 px-4 py-3 shadow-sm ring-1 ring-border/60">
      <span
        className={cn('grid size-9 shrink-0 place-items-center rounded-full', TONE_CLASSES[tone])}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
