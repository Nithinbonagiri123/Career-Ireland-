'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionResult } from '@/lib/result';

type PageResult<T> = { items: T[]; hasMore: boolean; page: number };

/**
 * R2 — debounced, paginated server search for pickers. Results come from a
 * server action (access-checked there); the hook only tracks the visible
 * state. Late responses from an older query are ignored, so typing fast
 * never shows results for a previous search.
 */
export function useServerSearch<T>(
  fetchPage: (input: { query: string; page: number }) => Promise<ActionResult<PageResult<T>>>,
  opts: { enabled: boolean; debounceMs?: number },
) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  // The query the visible results belong to (null until a search settles).
  const [resultsQuery, setResultsQuery] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(async (q: string, p: number) => {
    const seq = ++requestSeq.current;
    setStatus('loading');
    setError(null);
    try {
      const r = await fetchRef.current({ query: q, page: p });
      if (seq !== requestSeq.current) return;
      if (!r.ok) {
        setStatus('error');
        setError(r.error.message);
        return;
      }
      setItems((prev) => (p === 0 ? r.data.items : [...prev, ...r.data.items]));
      setPage(r.data.page);
      setHasMore(r.data.hasMore);
      setResultsQuery(q);
      setStatus('ready');
    } catch {
      if (seq !== requestSeq.current) return;
      setStatus('error');
      setError('Search failed. Check your connection and try again.');
    }
  }, []);

  const debounceMs = opts.debounceMs ?? 250;
  useEffect(() => {
    if (!opts.enabled) return;
    const t = setTimeout(() => void load(query.trim(), 0), debounceMs);
    return () => clearTimeout(t);
  }, [query, opts.enabled, debounceMs, load]);

  return {
    query,
    setQuery,
    items,
    hasMore,
    status,
    error,
    /** True once the results on screen are the finished search for exactly
     *  what is typed now — e.g. before offering "create new" shortcuts. */
    settled: status === 'ready' && resultsQuery === query.trim(),
    loadMore: () => {
      if (hasMore && status !== 'loading') void load(query.trim(), page + 1);
    },
    retry: () => void load(query.trim(), 0),
    reset: () => {
      requestSeq.current += 1;
      setQuery('');
      setItems([]);
      setPage(0);
      setHasMore(false);
      setStatus('idle');
      setError(null);
      setResultsQuery(null);
    },
  };
}
