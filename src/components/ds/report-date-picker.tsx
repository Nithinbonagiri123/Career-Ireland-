'use client';

import { CalendarDays } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { isIsoDay, toIsoDay } from './report-dates';
import { FOCUS_RING, SEG_TRAY, segItem } from './segmented';

/**
 * URL-driven date controls for finance reports. They only rewrite the
 * query string (`asOf`, or `from` + `to`); the server page re-parses with
 * `parseDateParam`, so an empty or invalid value simply falls back.
 */

const INPUT = cn(
  'h-9 rounded-lg border border-border/70 bg-card px-2.5 text-sm tabular-nums text-foreground shadow-xs',
  FOCUS_RING,
);

function useParamWriter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    for (const [k, v] of Object.entries(patch)) {
      if (v && isIsoDay(v)) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

/** Single "As of" date (trial balance, balance sheet). */
export function AsOfPicker({
  value,
  param = 'asOf',
  label = 'As of',
  className,
}: {
  /** Current effective date, YYYY-MM-DD. */
  value: string;
  param?: string;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const write = useParamWriter();
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarDays className="size-4" aria-hidden />
        {label}
      </label>
      <input
        id={id}
        type="date"
        className={INPUT}
        value={value}
        onChange={(e) => write({ [param]: e.target.value || null })}
      />
      <button
        type="button"
        className={cn(SEG_TRAY, 'h-9 px-3 text-sm', FOCUS_RING)}
        onClick={() => write({ [param]: null })}
      >
        Today
      </button>
    </div>
  );
}

type RangePreset = { key: string; label: string; from: Date; to: Date };

function presets(now = new Date()): RangePreset[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    { key: 'this-month', label: 'This month', from: new Date(y, m, 1), to: new Date(y, m + 1, 0) },
    { key: 'last-month', label: 'Last month', from: new Date(y, m - 1, 1), to: new Date(y, m, 0) },
    { key: 'this-year', label: 'This year', from: new Date(y, 0, 1), to: new Date(y, 11, 31) },
  ];
}

/** From / to range (P&L, VAT) with quick presets. */
export function ReportRangePicker({
  from,
  to,
  className,
}: {
  /** Current effective range, YYYY-MM-DD. */
  from: string;
  to: string;
  className?: string;
}) {
  const fromId = useId();
  const toId = useId();
  const write = useParamWriter();
  const options = presets();
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Report period</legend>
        <label htmlFor={fromId} className="text-sm text-muted-foreground">
          From
        </label>
        <input
          id={fromId}
          type="date"
          className={INPUT}
          value={from}
          max={to || undefined}
          onChange={(e) => write({ from: e.target.value || null, to })}
        />
        <label htmlFor={toId} className="text-sm text-muted-foreground">
          To
        </label>
        <input
          id={toId}
          type="date"
          className={INPUT}
          value={to}
          min={from || undefined}
          onChange={(e) => write({ from, to: e.target.value || null })}
        />
      </fieldset>
      <fieldset className={cn(SEG_TRAY, 'm-0 min-w-0')}>
        <legend className="sr-only">Quick ranges</legend>
        {options.map((p) => {
          const active = toIsoDay(p.from) === from && toIsoDay(p.to) === to;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              className={segItem(active)}
              onClick={() => write({ from: toIsoDay(p.from), to: toIsoDay(p.to) })}
            >
              {p.label}
            </button>
          );
        })}
      </fieldset>
    </div>
  );
}
