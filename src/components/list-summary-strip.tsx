import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Reusable KPI + filter-context strip that sits above every list page's
 * grid/table. Same shape everywhere so a candidate list, requisition list,
 * immigration case list, etc. all read consistently: total on the left,
 * grouped counts across the middle, active filter chips on the right.
 *
 * Intentionally a server component with plain data props — pages that
 * already fetch their rows can compute counts inline without a second
 * round-trip. Renders nothing when `total === 0` so we don't add visual
 * noise to genuinely empty lists (the empty-state below still fires).
 */

export type SummaryChip = {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
};

export type ActiveFilter = {
  /** Short label like "assigned: me" or "created: last 7 days". */
  label: string;
};

const TONE_STYLES: Record<Required<SummaryChip>['tone'], string> = {
  default: 'text-foreground',
  success: 'text-status-success',
  warning: 'text-status-warning',
  destructive: 'text-destructive',
  info: 'text-accent',
};

export function ListSummaryStrip({
  total,
  totalLabel = 'total',
  chips = [],
  filters = [],
  className,
  children,
}: {
  total: number;
  totalLabel?: string;
  /** Breakdown chips shown between the total and the filter list. */
  chips?: SummaryChip[];
  /** Active filter labels shown on the right. */
  filters?: ActiveFilter[];
  className?: string;
  /** Extra slot on the right (e.g. a Clear filters button). */
  children?: ReactNode;
}) {
  if (total === 0 && filters.length === 0) return null;
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-background/60 px-4 py-2 text-xs backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm font-semibold tabular-nums">
          {total.toLocaleString()}
        </span>
        <span className="text-muted-foreground">{totalLabel}</span>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {chips.map((chip) => (
            <div key={chip.label} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'font-mono text-sm font-medium tabular-nums',
                  TONE_STYLES[chip.tone ?? 'default'],
                )}
              >
                {chip.value.toLocaleString()}
              </span>
              <span className="text-muted-foreground">{chip.label}</span>
            </div>
          ))}
        </div>
      )}

      {(filters.length > 0 || children) && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {f.label}
            </span>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
