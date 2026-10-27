'use client';

import { Building2, Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServerSearch } from '@/lib/hooks/use-server-search';
import { cn } from '@/lib/utils';
import { searchEmployersForPickerAction } from '@/modules/pickers/actions';

export type EmployerOption = { id: string; legalName: string };

/**
 * R2 — searchable, paginated employer selector. The current employer is
 * shown and kept selected without loading any list; the list is fetched
 * from the server only when the operator opens the search. The chosen id
 * is validated again on the server by the form's own action.
 */
export function EmployerSearchSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EmployerOption | null;
  onChange: (next: EmployerOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const search = useServerSearch(searchEmployersForPickerAction, { enabled: open });

  return (
    <div className="space-y-2">
      <button
        id={id}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-xs transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value?.legalName ?? 'Select employer…'}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder="Search employers…"
              aria-label="Search employers"
              className="pl-9"
              autoFocus
            />
          </div>
          <div
            className="max-h-56 overflow-y-auto rounded-md border"
            aria-busy={search.status === 'loading'}
          >
            {search.status === 'error' ? (
              <div
                className="flex flex-col items-center gap-2 px-3 py-4 text-center text-xs text-destructive"
                role="alert"
              >
                <span>{search.error}</span>
                <Button type="button" size="sm" variant="outline" onClick={search.retry}>
                  Try again
                </Button>
              </div>
            ) : search.items.length === 0 && search.status !== 'ready' ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…
              </div>
            ) : search.items.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No employers match "{search.query.trim()}".
              </p>
            ) : (
              <ul className="divide-y" aria-label="Employers">
                {search.items.map((e) => {
                  const selected = value?.id === e.id;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          onChange({ id: e.id, legalName: e.legalName });
                          setOpen(false);
                          search.reset();
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                          selected ? 'bg-accent/10' : 'hover:bg-muted',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{e.legalName}</span>
                          {e.tradingName && e.tradingName !== e.legalName && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              t/a {e.tradingName}
                            </span>
                          )}
                        </span>
                        {selected && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
                {search.hasMore && (
                  <li>
                    <button
                      type="button"
                      onClick={search.loadMore}
                      disabled={search.status === 'loading'}
                      className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
                    >
                      {search.status === 'loading' && (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      )}
                      Show more
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
