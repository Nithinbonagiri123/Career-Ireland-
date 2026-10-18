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
import { LeadsFilterControl } from './leads-filter';

/**
 * Stage 6G Screen 01 — inline filter chip row matching the approved
 * Leads mockup: Search box on the left, then Status · Assigned to ·
 * Created · Nationality dropdown chips, then More Filters (the full
 * dropdown with everything else).
 *
 * Each chip reads/writes the SAME URL params the existing
 * LeadsTable (useSearchParams) and LeadsFilterControl already use,
 * so the inline chips and the "More Filters" dropdown are two views
 * of the same state — no divergence, no new filter server actions.
 */

const LEAD_STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'LOST', label: 'Lost' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
] as const;

const CREATED_PRESETS = [
  { value: '', label: 'Any time', days: null },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
] as const;

export function LeadsInlineFilterBar({
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
  const assigneeIds = useMemo(
    () =>
      (params.get('assignee') ?? '')
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
  const createdFrom = params.get('createdFrom');

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

  function setCreatedPreset(days: number | null) {
    patch((sp) => {
      sp.delete('createdFrom');
      sp.delete('createdTo');
      if (days !== null) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - days);
        sp.set('createdFrom', d.toISOString().slice(0, 10));
      }
    });
  }

  const statusLabel =
    statusValues.length === 0
      ? 'Status'
      : statusValues.length === 1
        ? (LEAD_STATUSES.find((s) => s.value === statusValues[0])?.label ?? 'Status')
        : `Status (${statusValues.length})`;

  const assignedLabel =
    assigneeIds.length === 0
      ? 'Assigned to'
      : assigneeIds.length === 1
        ? (assignees.find((a) => a.id === assigneeIds[0])?.fullName ?? 'Assigned to')
        : `Assigned to (${assigneeIds.length})`;

  const nationalityLabel =
    countryValues.length === 0
      ? 'Nationality'
      : countryValues.length === 1
        ? (countryValues[0] ?? 'Nationality')
        : `Nationality (${countryValues.length})`;

  const createdPreset = CREATED_PRESETS.find((p) => {
    if (!createdFrom) return p.days === null;
    if (p.days === null) return false;
    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() - p.days);
    return expected.toISOString().slice(0, 10) === createdFrom;
  });
  const createdLabel = createdPreset?.label ?? (createdFrom ? `Since ${createdFrom}` : 'Created');

  const anyActive =
    statusValues.length > 0 ||
    assigneeIds.length > 0 ||
    countryValues.length > 0 ||
    createdFrom !== null;

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
          placeholder="Search leads by name, email, phone…"
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
        {LEAD_STATUSES.map((s) => (
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

      <FilterChip label={createdLabel} active={createdFrom !== null}>
        {CREATED_PRESETS.map((p) => (
          <DropdownMenuItem
            key={p.value}
            onClick={() => setCreatedPreset(p.days)}
            className="cursor-pointer"
          >
            {p.label}
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

      <div className="ml-auto flex items-center gap-2">
        <LeadsFilterControl countries={countries} occupations={occupations} />
        {anyActive && (
          <button
            type="button"
            onClick={() =>
              patch((sp) => {
                sp.delete('status');
                sp.delete('assignee');
                sp.delete('country');
                sp.delete('createdFrom');
                sp.delete('createdTo');
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

/** Icon export used by the inline "More Filters" affordance from the page. */
export const InlineFiltersIcon = SlidersHorizontal;
