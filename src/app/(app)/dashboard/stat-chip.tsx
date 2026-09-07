import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

/**
 * Compact clickable KPI chip. Denser than a Card — designed so 4–6 fit
 * on one desktop row without dominating the page. `tone` recolours the
 * icon + label for at-a-glance urgency signalling. Interior uses a
 * plain `<Link>` and no motion primitives so a strip of these renders
 * fast even when the dashboard has ten of them.
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
  const showTone = tone && Number(value) > 0;
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col justify-between rounded-lg border bg-card px-4 py-3 transition-colors',
        'hover:border-foreground/20 hover:bg-card/80',
        showTone === true && tone === 'warning' && 'ring-1 ring-inset ring-status-warning/30',
        showTone === true && tone === 'danger' && 'ring-1 ring-inset ring-status-danger/30',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon
          aria-hidden
          className={cn(
            'size-3.5',
            !showTone && 'text-muted-foreground',
            showTone && tone === 'warning' && 'text-status-warning',
            showTone && tone === 'danger' && 'text-status-danger',
            showTone && tone === 'info' && 'text-status-info',
            showTone && tone === 'success' && 'text-status-success',
          )}
        />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </Link>
  );
}
