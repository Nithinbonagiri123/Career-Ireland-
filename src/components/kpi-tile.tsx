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
      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm ring-1 ring-border/60"
    >
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', KPI_TONES[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
