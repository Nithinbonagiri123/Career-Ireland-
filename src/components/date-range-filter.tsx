'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { arrowKeyNav, FOCUS_RING, SEG_TRAY, segItem } from './ds/segmented';

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

type Preset = 'month' | '7d' | '30d' | '90d';

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: 'month', label: 'This month' },
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

  const setPreset = (preset: '' | Preset) => {
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
      {/* Stage 6G segmented tray. It wraps onto a second line on narrow
         screens instead of scrolling sideways inside the filter row. */}
      <div
        role="tablist"
        aria-label="Created date filter"
        onKeyDown={(e) => arrowKeyNav(e, '[role="tab"], [data-seg-item]')}
        className={SEG_TRAY}
      >
        <span className="inline-flex h-8 items-center gap-1.5 px-2 text-[13px] text-muted-foreground">
          <CalendarClock className="size-3.5" aria-hidden />
          Created
        </span>
        <button
          type="button"
          role="tab"
          aria-selected={isAnytime}
          onClick={() => setPreset('')}
          className={segItem(isAnytime)}
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
              className={segItem(active)}
            >
              {p.label}
            </button>
          );
        })}
        {/* Stage B Wave 1 — the clear-X is a sibling of the Custom button,
            never nested inside it (nested buttons break hydration). */}
        <span className={cn(segItem(isCustom, 'gap-0 px-0'))}>
          <button
            type="button"
            data-seg-item
            onClick={() => setCustomOpen((v) => !v)}
            aria-expanded={customOpen}
            aria-haspopup="dialog"
            className={cn('inline-flex h-8 items-center rounded-lg px-3', FOCUS_RING)}
          >
            {customLabel}
          </button>
          {isCustom && (
            <button
              type="button"
              data-seg-item
              aria-label="Clear custom range"
              onClick={clearCustom}
              className={cn(
                'mr-1 inline-grid size-6 place-items-center rounded-md hover:bg-background/20',
                FOCUS_RING,
              )}
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      </div>

      <AnimatePresence>
        {customOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="dialog"
            aria-label="Custom date range"
            className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border/60 bg-popover p-3 shadow-lg sm:left-auto sm:right-0"
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
                className={cn(
                  'h-8 rounded-lg border border-border/70 px-3 text-xs text-muted-foreground hover:text-foreground',
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!from && !to}
                className={cn(
                  'h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50',
                  FOCUS_RING,
                )}
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
