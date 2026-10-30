import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DS_SOFT, type DsTone } from './tones';

/**
 * Stage 6G KPI tile (approved mockups 03 / 07): white card, pastel square
 * icon, sentence-case label, large number, one-line hint. `testId` keeps
 * existing `kpi-<label>` test hooks working.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
  trend,
  testId,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: DsTone;
  /** Optional small chip beside the number (e.g. "12 this month"). */
  trend?: ReactNode;
  testId?: string;
  /** Grid placement (e.g. a column span) from the page's layout. */
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex min-w-0 flex-col items-start gap-2.5 rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-3.5 sm:px-4',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl sm:size-11',
          DS_SOFT[tone],
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground/80">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
            {value}
          </span>
          {trend}
        </div>
        {hint && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** 2 → 4 column grid for StatTiles (tiles stack icon-over-label on phones). */
export function StatTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)}>{children}</div>;
}
