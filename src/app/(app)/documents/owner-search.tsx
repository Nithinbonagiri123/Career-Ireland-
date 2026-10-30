'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

/**
 * Owner-name search box for the /documents hub. Debounced so we don't
 * refetch on every keystroke. Preserves the other search params
 * (kind, date range) so filters compose.
 */
export function OwnerSearch() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initial = params.get('q') ?? '';
  const [text, setText] = useState(initial);
  const [, startTransition] = useTransition();

  // Keep local state in sync when the URL param is cleared externally
  // (e.g. clicking a segmented filter).
  useEffect(() => {
    setText(params.get('q') ?? '');
  }, [params]);

  // Debounced push on typing.
  useEffect(() => {
    if (text === (params.get('q') ?? '')) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (text.trim()) next.set('q', text.trim());
      else next.delete('q');
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(t);
  }, [text, params, pathname, router]);

  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search owner…"
        aria-label="Search owner"
        className="h-10 w-full rounded-xl border border-border/70 bg-background pl-9 pr-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
