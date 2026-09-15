'use client';

import { Filter, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * URL-driven filters for the audit log page. Reads/writes:
 *   - ?actor=<userId>
 *   - ?action=<verb>
 *   - ?entity=<entityType>
 *   - ?created=<preset> | ?from=<date>&?to=<date>   (via DateRangeFilter)
 *
 * Server page reads these back on the next render — no client state
 * needed. Every option list is precomputed server-side so the dropdown
 * options only include values that actually exist in the log (no dead
 * choices).
 */
type Actor = { id: string; email: string; fullName: string };

export function AuditFilters({
  actors,
  actions,
  entityTypes,
  activeFilters,
}: {
  actors: Actor[];
  actions: string[];
  entityTypes: string[];
  activeFilters: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const currentActor = params?.get('actor') ?? '';
  const currentAction = params?.get('action') ?? '';
  const currentEntity = params?.get('entity') ?? '';

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params?.toString() ?? '');
      if (value) next.set(key, value);
      else next.delete(key);
      // A filter change resets pagination — no need to clear a cursor
      // param because the audit table keeps cursor in local React state,
      // not the URL.
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname, router],
  );

  const clearAll = () => {
    router.push(pathname);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <div className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Filter className="size-3.5" aria-hidden />
        Filter
        {activeFilters > 0 && (
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {activeFilters}
          </Badge>
        )}
      </div>

      <select
        aria-label="Actor"
        value={currentActor}
        onChange={(e) => setParam('actor', e.target.value || null)}
        className="h-8 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">All actors</option>
        {actors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
          </option>
        ))}
      </select>

      <select
        aria-label="Action"
        value={currentAction}
        onChange={(e) => setParam('action', e.target.value || null)}
        className="h-8 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">All actions</option>
        {actions.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      <select
        aria-label="Entity type"
        value={currentEntity}
        onChange={(e) => setParam('entity', e.target.value || null)}
        className="h-8 rounded-md border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <option value="">All entities</option>
        {entityTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <DateRangeFilter />

      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-xs">
          <X className="mr-1 size-3" aria-hidden />
          Clear all
        </Button>
      )}
    </div>
  );
}
