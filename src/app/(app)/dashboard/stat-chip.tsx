import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

/**
 * Dense clickable KPI. Numbers spring in via the small client-only
 * <AnimatedCounter> so the dashboard feels alive on first paint; every
 * other effect (hover lift, icon medallion swap, tone underline) is
 * pure CSS so this whole card stays a Server Component. That lets
 * callers (Server Components) pass `icon={Users}` without tripping the
 * RSC "functions cannot be passed to Client Components" barrier.
 */
export function StatChip({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  tone?: StatusTone;
}) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const isNumeric = !Number.isNaN(numeric);
  const showTone = tone && isNumeric && numeric > 0;

  return (
    <Link
      href={href}
      className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div
        className={cn(
          'flex flex-col justify-between rounded-lg border bg-card px-4 py-3.5 transition-all duration-200 ease-out',
          'group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:bg-card/95 group-hover:shadow-[0_8px_20px_-10px_oklch(0.185_0.012_60/0.15)]',
          showTone && tone === 'warning' && 'ring-1 ring-inset ring-status-warning/30',
          showTone && tone === 'danger' && 'ring-1 ring-inset ring-status-danger/30',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div
            className={cn(
              'flex size-6 items-center justify-center rounded-md transition-colors',
              'bg-muted/50 group-hover:bg-muted',
              showTone &&
                tone === 'warning' &&
                'bg-status-warning-soft group-hover:bg-status-warning-soft/80',
              showTone &&
                tone === 'danger' &&
                'bg-status-danger-soft group-hover:bg-status-danger-soft/80',
              showTone &&
                tone === 'info' &&
                'bg-status-info-soft group-hover:bg-status-info-soft/80',
              showTone &&
                tone === 'success' &&
                'bg-status-success-soft group-hover:bg-status-success-soft/80',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-3.5 transition-colors',
                !showTone && 'text-muted-foreground group-hover:text-foreground',
                showTone && tone === 'warning' && 'text-status-warning',
                showTone && tone === 'danger' && 'text-status-danger',
                showTone && tone === 'info' && 'text-status-info',
                showTone && tone === 'success' && 'text-status-success',
              )}
            />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-none tabular-nums tracking-tight">
            {isNumeric ? <AnimatedCounter value={numeric} /> : value}
          </span>
        </div>
        {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}

        {/* Accent underline draws left-to-right on hover — subtle
            signal of interactivity in a way a plain border doesn't. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-4 bottom-0 h-[2px] origin-left scale-x-0 rounded-full bg-foreground/30 transition-transform duration-300 ease-out group-hover:scale-x-100',
            showTone && tone === 'warning' && 'bg-status-warning',
            showTone && tone === 'danger' && 'bg-status-danger',
            showTone && tone === 'info' && 'bg-status-info',
            showTone && tone === 'success' && 'bg-status-success',
          )}
        />
      </div>
    </Link>
  );
}
