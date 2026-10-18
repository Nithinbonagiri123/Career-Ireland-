'use client';

import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Stage 6G Screen 03 — inline filter chip row matching the approved
 * Candidates mockup: Search box on the left, then Status · Profession ·
 * Nationality · Assigned to dropdown chips, then More Filters (a
 * passthrough affordance for a future advanced panel).
 *
 * Each chip reads/writes URL params directly so the chip row and any
 * future advanced panel are two views of the same state — no divergence,
 * no new filter server actions. The CandidateCard + CandidatesTable
 * client components can read the same params to filter in-browser.
 */

const CANDIDATE_STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'TEMPORARILY_UNAVAILABLE', label: 'Unavailable' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export function CandidatesInlineFilterBar({
  countries,
  occupations,
  assignees,
}: {
  countries: string[];
  occupations: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; fullName: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('q') ?? '';
  const statusValues = useMemo(
    () =>
      (params.get('status') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [params],
  );
  const professionIds = useMemo(
    () =>
      (params.get('profession') ?? '')
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

  function patch(mut: (sp: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mut(next);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : '?');
  }

  function toggle(key: string, value: string, current: string[]) {
    const nextList = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    patch((sp) => {
      if (nextList.length === 0) sp.delete(key);
      else sp.set(key, nextList.join(','));
    });
  }

  const statusLabel =
    statusValues.length === 0
      ? 'Status'
      : statusValues.length === 1
        ? (CANDIDATE_STATUSES.find((s) => s.value === statusValues[0])?.label ?? 'Status')
        : `Status (${statusValues.length})`;

  const professionLabel =
    professionIds.length === 0
      ? 'Profession'
      : professionIds.length === 1
        ? (occupations.find((o) => o.id === professionIds[0])?.name ?? 'Profession')
        : `Profession (${professionIds.length})`;

  const nationalityLabel =
    countryValues.length === 0
      ? 'Nationality'
      : countryValues.length === 1
        ? (countryValues[0] ?? 'Nationality')
        : `Nationality (${countryValues.length})`;

  const assignedLabel =
    assigneeIds.length === 0
      ? 'Assigned to'
      : assigneeIds.length === 1
        ? (assignees.find((a) => a.id === assigneeIds[0])?.fullName ?? 'Assigned to')
        : `Assigned to (${assigneeIds.length})`;

  const anyActive =
    statusValues.length > 0 ||
    professionIds.length > 0 ||
    countryValues.length > 0 ||
    assigneeIds.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 shadow-sm ring-1 ring-border/60">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search candidates by name, email, profession…"
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            patch((sp) => {
              if (v) sp.set('q', v);
              else sp.delete('q');
            });
          }}
          className="h-9 pl-9"
        />
      </div>

      <FilterChip label={statusLabel} active={statusValues.length > 0}>
        {CANDIDATE_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => toggle('status', s.value, statusValues)}
            className={cn(
              'cursor-pointer',
              statusValues.includes(s.value) && 'bg-accent text-accent-foreground',
            )}
          >
            {s.label}
          </DropdownMenuItem>
        ))}
      </FilterChip>

      <FilterChip label={professionLabel} active={professionIds.length > 0}>
        <DropdownMenuItem onClick={() => patch((sp) => sp.delete('profession'))}>
          Any profession
        </DropdownMenuItem>
        {occupations.slice(0, 30).map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => toggle('profession', o.id, professionIds)}
            className={cn(
              'cursor-pointer',
              professionIds.includes(o.id) && 'bg-accent text-accent-foreground',
            )}
          >
            {o.name}
          </DropdownMenuItem>
        ))}
      </FilterChip>

      <FilterChip label={nationalityLabel} active={countryValues.length > 0}>
        <DropdownMenuItem onClick={() => patch((sp) => sp.delete('country'))}>
          Any nationality
        </DropdownMenuItem>
        {countries.slice(0, 30).map((c) => (
          <DropdownMenuItem
            key={c}
            onClick={() => toggle('country', c, countryValues)}
            className={cn(
              'cursor-pointer',
              countryValues.includes(c) && 'bg-accent text-accent-foreground',
            )}
          >
            {c}
          </DropdownMenuItem>
        ))}
      </FilterChip>

      <FilterChip label={assignedLabel} active={assigneeIds.length > 0}>
        <DropdownMenuItem onClick={() => patch((sp) => sp.delete('assignee'))}>
          Anyone
        </DropdownMenuItem>
        {assignees.slice(0, 20).map((a) => (
          <DropdownMenuItem
            key={a.id}
            onClick={() => toggle('assignee', a.id, assigneeIds)}
            className={cn(
              'cursor-pointer',
              assigneeIds.includes(a.id) && 'bg-accent text-accent-foreground',
            )}
          >
            {a.fullName}
          </DropdownMenuItem>
        ))}
      </FilterChip>

      <div className="ml-auto flex items-center gap-2">
        {/* Placeholder trigger for a future advanced-filter sheet. The
            inline chips above cover the common cases; this slot keeps a
            visible "More Filters" affordance so the mockup's intent is
            preserved even before the sheet lands. */}
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          disabled
          title="Advanced filters coming soon"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          More filters
        </button>
        {anyActive && (
          <button
            type="button"
            onClick={() =>
              patch((sp) => {
                sp.delete('status');
                sp.delete('profession');
                sp.delete('country');
                sp.delete('assignee');
              })
            }
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted',
              active && 'border-sky-400 bg-sky-50 text-sky-800 hover:bg-sky-100',
            )}
          >
            {label}
            <ChevronDown className="size-3.5 opacity-70" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-56 p-1">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
