'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterToolbar } from '@/components/ds/list-controls';
import { FOCUS_RING } from '@/components/ds/segmented';
import { cn } from '@/lib/utils';
import { LeadsFilterControl } from './leads-filter';

/**
 * Stage 6G — Leads filter row on the shared FilterToolbar (approved mockup
 * 01): search, then multi-select Status · Assigned to · Nationality, then
 * the full "Filter" menu (created range, active / expired, source,
 * profession) and Sort.
 *
 * Every control reads / writes the SAME URL params the list already uses
 * (`q`, `status`, `assignee`, `country` — comma-separated multi-values), so
 * bookmarks, existing links and the "Filter" menu stay in sync.
 */

export const LEAD_STATUS_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'LOST', label: 'Lost' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
] as const;

export const LEAD_SORTS = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
] as const;

export function LeadsToolbar({
  countries,
  occupations,
  assignees,
}: {
  countries: string[];
  occupations: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; fullName: string }>;
}) {
  return (
    <FilterToolbar
      searchPlaceholder="Search leads by name, email, phone…"
      selects={[
        {
          param: 'status',
          label: 'Status',
          multiple: true,
          options: [{ value: '', label: 'All statuses' }, ...LEAD_STATUS_OPTIONS],
        },
        {
          param: 'assignee',
          label: 'Assigned to',
          multiple: true,
          options: [
            { value: '', label: 'All staff' },
            ...assignees.map((a) => ({ value: a.id, label: a.fullName })),
          ],
        },
        {
          param: 'country',
          label: 'Nationality',
          multiple: true,
          secondary: true,
          options: [
            { value: '', label: 'All nationalities' },
            ...countries.map((c) => ({ value: c, label: c })),
          ],
        },
      ]}
      extra={
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:shrink-0">
          <SortSelect />
          <div className="flex h-10 items-center">
            <LeadsFilterControl countries={countries} occupations={occupations} />
          </div>
        </div>
      }
    />
  );
}

/** Sort for the leads list; the first option is the default (no param). */
function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get('sort') ?? LEAD_SORTS[0].value;
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-xs font-medium text-foreground/70">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === LEAD_SORTS[0].value) next.delete('sort');
          else next.set('sort', e.target.value);
          next.delete('page');
          const qs = next.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
        className={cn(
          'h-10 w-full min-w-36 rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground shadow-xs',
          FOCUS_RING,
        )}
      >
        {LEAD_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
