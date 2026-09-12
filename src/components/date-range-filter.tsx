'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * URL-driven "Created" date-range filter for list pages.
 *
 * Writes one of:
 *   - `?created=7d|30d|90d` (preset)
 *   - `?from=YYYY-MM-DD[&to=YYYY-MM-DD]` (custom)
 *
 * and clears the other family whenever the user switches. Server pages
 * decode with `parseDateRangeParams` and push down to drizzle with
 * `dateRangeWhere` — see `src/lib/date-range.ts`.
 */

const PRESETS: Array<{ value: '7d' | '30d' | '90d'; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export function DateRangeFilter({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentPreset = params?.get('created') ?? '';
  const currentFrom = params?.get('from') ?? '';
  const currentTo = params?.get('to') ?? '';
  const isCustom = !!(currentFrom || currentTo);
  const isAnytime = !currentPreset && !isCustom;

  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(currentFrom);
  const [to, setTo] = useState(currentTo);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync local custom-range inputs when the URL changes externally.
  useEffect(() => {
    setFrom(currentFrom);
    setTo(currentTo);
  }, [currentFrom, currentTo]);

  // Close popover on outside click / escape.
  useEffect(() => {
    if (!customOpen) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCustomOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCustomOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [customOpen]);

  const setPreset = (preset: '' | '7d' | '30d' | '90d') => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    usp.delete('from');
    usp.delete('to');
    if (preset === '') usp.delete('created');
    else usp.set('created', preset);
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const applyCustom = () => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    usp.delete('created');
    if (from) usp.set('from', from);
    else usp.delete('from');
    if (to) usp.set('to', to);
    else usp.delete('to');
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setCustomOpen(false);
  };

  const clearCustom = () => {
    setFrom('');
    setTo('');
    const usp = new URLSearchParams(params?.toString() ?? '');
    usp.delete('from');
    usp.delete('to');
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const customLabel = isCustom ? `${currentFrom || '…'} → ${currentTo || '…'}` : 'Custom';

  return (
    <div className={cn('relative', className)} ref={popoverRef}>
      <div
        role="tablist"
        aria-label="Created date filter"
        className="inline-flex items-center gap-0.5 rounded-md border bg-card p-0.5 text-xs"
      >
        <span className="inline-flex items-center gap-1 px-2 text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden />
          Created
        </span>
        <button
          type="button"
          role="tab"
          aria-selected={isAnytime}
          onClick={() => setPreset('')}
          className={cn(
            'rounded px-2.5 py-1 transition-colors',
            isAnytime
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
        >
          Anytime
        </button>
        {PRESETS.map((p) => {
          const active = !isCustom && currentPreset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPreset(p.value)}
              className={cn(
                'rounded px-2.5 py-1 transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          aria-expanded={customOpen}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors',
            isCustom
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
        >
          {customLabel}
          {isCustom && (
            <button
              type="button"
              aria-label="Clear custom range"
              onClick={(e) => {
                e.stopPropagation();
                clearCustom();
              }}
              className="ml-1 inline-flex items-center rounded p-0.5 hover:bg-background/40"
            >
              <X className="size-3" />
            </button>
          )}
        </button>
      </div>

      <AnimatePresence>
        {customOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border bg-popover p-3 shadow-lg ring-1 ring-foreground/10"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Custom range
            </p>
            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.currentTarget.value)}
                  className="h-8 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.currentTarget.value)}
                  className="h-8 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!from && !to}
                className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
