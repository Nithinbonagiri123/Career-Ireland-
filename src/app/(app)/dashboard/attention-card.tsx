import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

/**
 * "Attention needed" card — a single-metric card with a tone-tinted
 * shoulder, tone-tinted count, and space for a small preview list of
 * rows underneath. Sits at the top of the dashboard so the first thing
 * staff see is what they need to act on today, not vanity metrics.
 */
export function AttentionCard({
  title,
  count,
  href,
  icon: Icon,
  tone,
  children,
  emptyLabel,
}: {
  title: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: StatusTone;
  children?: ReactNode;
  /** Rendered instead of the preview list when count === 0. Keep it short. */
  emptyLabel: string;
}) {
  const isEmpty = count === 0;
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:bg-card/80',
        !isEmpty && tone === 'danger' && 'border-status-danger/30',
        !isEmpty && tone === 'warning' && 'border-status-warning/30',
        !isEmpty && tone === 'info' && 'border-status-info/30',
      )}
    >
      {/* Tone accent strip on the leading edge — visible only when there's
          something to action. Keeps calm state calm. */}
      {!isEmpty && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 left-0 w-1',
            tone === 'danger' && 'bg-status-danger',
            tone === 'warning' && 'bg-status-warning',
            tone === 'info' && 'bg-status-info',
            tone === 'success' && 'bg-status-success',
          )}
        />
      )}
      <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon
            aria-hidden
            className={cn(
              'size-4',
              isEmpty && 'text-muted-foreground',
              !isEmpty && tone === 'danger' && 'text-status-danger',
              !isEmpty && tone === 'warning' && 'text-status-warning',
              !isEmpty && tone === 'info' && 'text-status-info',
              !isEmpty && tone === 'success' && 'text-status-success',
            )}
          />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <span
          className={cn(
            'font-semibold tabular-nums',
            isEmpty ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {count}
        </span>
      </div>
      <div className="min-h-[92px] px-4 py-3">
        {isEmpty ? <p className="pt-1.5 text-xs text-muted-foreground">{emptyLabel}</p> : children}
      </div>
      <div className="flex items-center justify-end border-t bg-muted/10 px-4 py-1.5 text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
        Open <ArrowRight className="ml-1 size-3" />
      </div>
    </Link>
  );
}
