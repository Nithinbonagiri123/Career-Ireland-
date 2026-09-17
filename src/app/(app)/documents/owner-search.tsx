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
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search owner…"
        className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
