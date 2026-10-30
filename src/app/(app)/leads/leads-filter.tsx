'use client';

import { Filter, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * Leads filter dropdown. Writes multi-value filters into URL params:
 *
 *   /leads?status=NEW,CONTACTED
 *         &active=true   (shortcut: active = NEW,CONTACTED,AWAITING_PAYMENT)
 *         &expired=true  (shortcut: expired = EXPIRED)
 *         &source=DIRECT,REFERRAL
 *         &country=Ireland,South%20Africa
 *         &profession=<uuid>
 *
 * The leads-table reads these params client-side (via useSearchParams)
 * and filters the already-fetched rows. Date range + ownership scope
 * continue to live in the PageHeader controls (DateRangeFilter +
 * ScopeFilter), so we don't duplicate them here.
 *
 * Preserves search, sorting + pagination because the DataTable
 * operates on the array we hand it after filtering.
 */

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'AWAITING_PAYMENT',
  'CONVERTED',
  'LOST',
  'REJECTED',
  'EXPIRED',
] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

const PERSON_SOURCES = [
  'DIRECT',
  'REFERRAL',
  'ADVERTISEMENT',
  'EMPLOYER_REFERRAL',
  'OTHER',
] as const;

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "AWAITING_PAYMENT" → "Awaiting payment". */
function sentence(v: string): string {
  const t = v.toLowerCase().replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function joinList(arr: string[]): string | null {
  return arr.length > 0 ? arr.join(',') : null;
}

export function LeadsFilterControl({
  countries,
  occupations,
}: {
  countries: string[];
  occupations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const current = useMemo(
    () => ({
      status: parseList(params.get('status')) as LeadStatus[],
      active: params.get('active') === 'true',
      expired: params.get('expired') === 'true',
      source: parseList(params.get('source')),
      country: parseList(params.get('country')),
      profession: parseList(params.get('profession')),
      // Canonical `from` / `to`, falling back to the legacy aliases.
      createdFrom: params.get('from') ?? params.get('createdFrom') ?? '',
      createdTo: params.get('to') ?? params.get('createdTo') ?? '',
    }),
    [params],
  );

  const activeCount =
    current.status.length +
    (current.active ? 1 : 0) +
    (current.expired ? 1 : 0) +
    current.source.length +
    current.country.length +
    current.profession.length +
    (current.createdFrom ? 1 : 0) +
    (current.createdTo ? 1 : 0);

  function applyPatch(patch: {
    status?: LeadStatus[];
    active?: boolean;
    expired?: boolean;
    source?: string[];
    country?: string[];
    profession?: string[];
    createdFrom?: string;
    createdTo?: string;
  }) {
    const next = new URLSearchParams(params);
    const set = (k: string, v: string | null) => {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    };
    if (patch.status !== undefined) set('status', joinList(patch.status));
    if (patch.active !== undefined) set('active', patch.active ? 'true' : null);
    if (patch.expired !== undefined) set('expired', patch.expired ? 'true' : null);
    if (patch.source !== undefined) set('source', joinList(patch.source));
    if (patch.country !== undefined) set('country', joinList(patch.country));
    if (patch.profession !== undefined) set('profession', joinList(patch.profession));
    // Exact dates write the canonical `from` / `to` (shared with the
    // Created control) and drop the preset and the legacy aliases, so only
    // one date range is ever in force.
    if (patch.createdFrom !== undefined || patch.createdTo !== undefined) {
      const nextFrom = patch.createdFrom ?? current.createdFrom;
      const nextTo = patch.createdTo ?? current.createdTo;
      for (const k of ['created', 'createdFrom', 'createdTo']) next.delete(k);
      set('from', nextFrom || null);
      set('to', nextTo || null);
    }
    // Any filter change starts again from page 1.
    next.delete('page');
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  function toggleInArray<T extends string>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  function clearAll() {
    const next = new URLSearchParams(params);
    for (const k of [
      'status',
      'active',
      'expired',
      'source',
      'country',
      'profession',
      'created',
      'from',
      'to',
      'createdFrom',
      'createdTo',
    ]) {
      next.delete(k);
    }
    next.delete('page');
    router.replace(`?${next.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="h-10 rounded-xl border-border/70 px-3.5">
            <Filter className="mr-1.5 size-4" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1.5 rounded-md bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">More filters</div>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              type="button"
              onClick={clearAll}
            >
              <X className="mr-1 size-3" /> Clear all
            </Button>
          )}
        </div>

        <DropdownMenuSeparator className="my-2" />

        {/* Created date range */}
        <div className="space-y-1.5">
          <Label className="text-xs">Created</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label
                htmlFor="leads-filter-created-from"
                className="text-[10px] text-muted-foreground"
              >
                From
              </Label>
              <Input
                id="leads-filter-created-from"
                type="date"
                value={current.createdFrom}
                onChange={(e) => applyPatch({ createdFrom: e.target.value })}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label
                htmlFor="leads-filter-created-to"
                className="text-[10px] text-muted-foreground"
              >
                To
              </Label>
              <Input
                id="leads-filter-created-to"
                type="date"
                value={current.createdTo}
                onChange={(e) => applyPatch({ createdTo: e.target.value })}
                className="h-7 text-xs"
              />
            </div>
          </div>
        </div>

        <DropdownMenuSeparator className="my-3" />

        {/* Active / Expired quick toggles */}
        <div className="space-y-2">
          <Label className="text-xs">Quick</Label>
          <div className="flex gap-2">
            <Button
              variant={current.active ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              type="button"
              onClick={() => applyPatch({ active: !current.active, expired: false })}
            >
              Active only
            </Button>
            <Button
              variant={current.expired ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              type="button"
              onClick={() => applyPatch({ expired: !current.expired, active: false })}
            >
              Expired only
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator className="my-3" />

        {/* Status checkboxes */}
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <div className="grid grid-cols-2 gap-1">
            {LEAD_STATUSES.map((s) => {
              const checked = current.status.includes(s);
              return (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => applyPatch({ status: toggleInArray(current.status, s) })}
                  />
                  {sentence(s)}
                </label>
              );
            })}
          </div>
        </div>

        <DropdownMenuSeparator className="my-3" />

        {/* Source */}
        <div className="space-y-1.5">
          <Label className="text-xs">Source</Label>
          <div className="grid grid-cols-2 gap-1">
            {PERSON_SOURCES.map((s) => {
              const checked = current.source.includes(s);
              return (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => applyPatch({ source: toggleInArray(current.source, s) })}
                  />
                  {sentence(s)}
                </label>
              );
            })}
          </div>
        </div>

        <DropdownMenuSeparator className="my-3" />

        {/* Country */}
        <div className="space-y-1.5">
          <Label htmlFor="leads-filter-country" className="text-xs">
            Country
          </Label>
          <Select
            id="leads-filter-country"
            value={current.country[0] ?? ''}
            onChange={(e) => applyPatch({ country: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Any country</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        <DropdownMenuSeparator className="my-3" />

        {/* Profession */}
        <div className="space-y-1.5">
          <Label htmlFor="leads-filter-profession" className="text-xs">
            Profession
          </Label>
          <Select
            id="leads-filter-profession"
            value={current.profession[0] ?? ''}
            onChange={(e) => applyPatch({ profession: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">Any profession</option>
            {occupations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
