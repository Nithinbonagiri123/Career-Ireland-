import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Workspace KPI tile — extracted unchanged from the R1 employer workspace
 * so the R2 job workspace renders the identical treatment (Stage 6G: solid
 * card, coloured icon disc, uppercase label, tabular value, one-line hint).
 * `data-testid="kpi-<label>"` is part of the contract the R1/R2 specs use.
 */
export const KPI_TONES = {
  blue: 'bg-sky-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-500 text-white',
  rose: 'bg-rose-500 text-white',
} as const;

export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof KPI_TONES;
}) {
  return (
    <div
      data-testid={`kpi-${label}`}
      className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-3 shadow-sm ring-1 ring-border/60 sm:gap-3 sm:px-4"
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', KPI_TONES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {/* Wraps the number under a long label on narrow tiles instead of overlapping it. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="min-w-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
