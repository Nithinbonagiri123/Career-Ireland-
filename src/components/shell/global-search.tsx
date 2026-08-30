'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, Building2, Loader2, PlaneTakeoff, Search, User, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { SearchResult, SearchResultKind } from '@/modules/search/service';

const KIND_ICON: Record<SearchResultKind, typeof Search> = {
  candidate: UserCheck,
  person: User,
  employer: Building2,
  requisition: Briefcase,
  immigration: PlaneTakeoff,
};

const KIND_LABEL: Record<SearchResultKind, string> = {
  candidate: 'Candidates',
  person: 'People',
  employer: 'Employers',
  requisition: 'Requisitions',
  immigration: 'Immigration cases',
};

const GROUP_ORDER: SearchResultKind[] = [
  'candidate',
  'employer',
  'requisition',
  'immigration',
  'person',
];

function groupResults(
  results: SearchResult[],
): Array<{ kind: SearchResultKind; items: SearchResult[] }> {
  const map = new Map<SearchResultKind, SearchResult[]>();
  for (const r of results) {
    const list = map.get(r.kind) ?? [];
    list.push(r);
    map.set(r.kind, list);
  }
  return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
    kind: k,
    items: (map.get(k) ?? []).sort((a, b) => b.score - a.score),
  }));
}

/** Global command palette: opens on ⌘K / Ctrl+K, escape to close, arrow keys + Enter to navigate. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flatResults = useMemo(() => {
    const grouped = groupResults(results);
    return grouped.flatMap((g) => g.items);
  }, [results]);

  const grouped = useMemo(() => groupResults(results), [results]);

  // Cmd/Ctrl + K to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Focus + reset when opening
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    setLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { results: SearchResult[] };
        setResults(data.results);
        setActiveIndex(0);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, open]);

  const go = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      router.push(r.href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatResults.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      const item = flatResults[activeIndex];
      if (item) {
        e.preventDefault();
        go(item);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
        className="relative flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-input bg-transparent pl-9 pr-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
        <span className="truncate">Search candidates, employers, cases…</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="search-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
        {open && (
          <motion.div
            key="search-panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            role="dialog"
            aria-label="Global search"
            className="fixed left-1/2 top-24 z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10"
          >
            <div className="relative flex items-center border-b">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="search"
                placeholder="Search candidates, employers, requisitions, cases…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                className="h-14 w-full bg-transparent pl-11 pr-14 text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading && (
                <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {query.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              ) : !loading && results.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No results for "{query.trim()}".
                </p>
              ) : (
                grouped.map((g) => (
                  <div key={g.kind}>
                    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {KIND_LABEL[g.kind]}
                    </p>
                    <ul className="pb-1">
                      {g.items.map((item) => {
                        const flatIndex = flatResults.indexOf(item);
                        const active = flatIndex === activeIndex;
                        const Icon = KIND_ICON[item.kind];
                        return (
                          <li key={`${item.kind}-${item.id}`}>
                            <button
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => go(item)}
                              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                                active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/40'
                              }`}
                            >
                              <Icon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{item.title}</span>
                                {item.subtitle && (
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {item.subtitle}
                                  </span>
                                )}
                              </span>
                              <Badge variant="outline" className="rounded-full text-[10px]">
                                {KIND_LABEL[item.kind].replace(/s$/, '')}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
              <span>
                <kbd className="rounded border bg-background px-1">↑</kbd>{' '}
                <kbd className="rounded border bg-background px-1">↓</kbd> navigate ·{' '}
                <kbd className="rounded border bg-background px-1">Enter</kbd> open ·{' '}
                <kbd className="rounded border bg-background px-1">Esc</kbd> close
              </span>
              <span>Cross-entity search</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
