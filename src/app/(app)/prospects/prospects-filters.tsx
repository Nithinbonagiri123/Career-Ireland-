'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ProspectStatusSchema } from '@/modules/campaigns/schemas';

type Status = z.infer<typeof ProspectStatusSchema>;

const STATUS_CHIPS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'SCREENED', label: 'Screened' },
  { value: 'CONVERTED_TO_CANDIDATE', label: 'Converted' },
  { value: 'RETAINED_IN_POOL', label: 'Talent pool' },
  { value: 'NOT_SUITABLE', label: 'Not suitable' },
];

export function ProspectsFilters({
  campaigns,
  countries,
  active,
}: {
  campaigns: Array<{ id: string; name: string }>;
  countries: string[];
  active: {
    status?: Status;
    campaignId?: string;
    country?: string;
    q?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(active.q ?? '');

  // Debounce search input into URL.
  useEffect(() => {
    const current = params?.get('q') ?? '';
    if (current === q) return;
    const t = setTimeout(() => {
      const usp = new URLSearchParams(params?.toString() ?? '');
      if (q.trim().length > 0) usp.set('q', q.trim());
      else usp.delete('q');
      const qs = usp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => clearTimeout(t);
  }, [q, params, pathname, router]);

  const setParam = (key: string, value: string | undefined) => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    if (value && value.length > 0) usp.set(key, value);
    else usp.delete(key);
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const activeCount = useMemo(() => {
    let n = 0;
    if (active.status) n++;
    if (active.campaignId) n++;
    if (active.country) n++;
    if (active.q) n++;
    return n;
  }, [active]);

  const clearAll = () => {
    setQ('');
    router.push(pathname);
  };

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or email…"
            className="pl-8"
            aria-label="Search prospects"
          />
        </div>
        <select
          aria-label="Filter by campaign"
          value={active.campaignId ?? ''}
          onChange={(e) => setParam('campaign', e.target.value || undefined)}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by country"
          value={active.country ?? ''}
          onChange={(e) => setParam('country', e.target.value || undefined)}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Clear ({activeCount})
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Filter by status"
        className="flex flex-wrap items-center gap-1.5"
      >
        {STATUS_CHIPS.map((chip) => {
          const on =
            chip.value === 'all' ? active.status === undefined : active.status === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() =>
                setParam('status', chip.value === 'all' ? undefined : (chip.value as string))
              }
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                on
                  ? 'border-foreground/40 bg-foreground/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
