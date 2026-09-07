import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

/**
 * Priority card at the top of the dashboard. Kept as a Server Component
 * so `icon={LucideIcon}` still crosses the boundary; hover motion is
 * pure CSS (translate + width transition + arrow slide) and the number
 * springs in via the small client-only <AnimatedCounter>.
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
  emptyLabel: string;
}) {
  const isEmpty = count === 0;
  return (
    <Link
      href={href}
      className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div
        className={cn(
          'relative flex flex-col overflow-hidden rounded-lg border bg-card transition-all duration-200 ease-out',
          'group-hover:-translate-y-0.5 group-hover:bg-card/95 group-hover:shadow-[0_8px_24px_-10px_oklch(0.185_0.012_60/0.18)]',
          !isEmpty &&
            tone === 'danger' &&
            'border-status-danger/30 group-hover:border-status-danger/50',
          !isEmpty &&
            tone === 'warning' &&
            'border-status-warning/30 group-hover:border-status-warning/50',
          !isEmpty && tone === 'info' && 'border-status-info/30 group-hover:border-status-info/50',
        )}
      >
        {/* Tone accent strip on the leading edge — thickens on hover. */}
        {!isEmpty && (
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-0 left-0 w-1 transition-[width] duration-200 ease-out group-hover:w-1.5',
              tone === 'danger' && 'bg-status-danger',
              tone === 'warning' && 'bg-status-warning',
              tone === 'info' && 'bg-status-info',
              tone === 'success' && 'bg-status-success',
            )}
          />
        )}

        <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-md transition-transform duration-300 ease-out group-hover:scale-110',
                isEmpty && 'bg-muted/60 text-muted-foreground',
                !isEmpty && tone === 'danger' && 'bg-status-danger-soft text-status-danger',
                !isEmpty && tone === 'warning' && 'bg-status-warning-soft text-status-warning',
                !isEmpty && tone === 'info' && 'bg-status-info-soft text-status-info',
                !isEmpty && tone === 'success' && 'bg-status-success-soft text-status-success',
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </span>
            <span className="text-sm font-medium">{title}</span>
          </div>
          <span
            className={cn(
              'text-lg font-semibold leading-none tabular-nums',
              isEmpty ? 'text-muted-foreground/60' : 'text-foreground',
            )}
          >
            <AnimatedCounter value={count} />
          </span>
        </div>

        <div className="min-h-[92px] px-4 py-3">
          {isEmpty ? (
            <p className="pt-1.5 text-xs text-muted-foreground/80">{emptyLabel}</p>
          ) : (
            children
          )}
        </div>

        <div className="flex items-center justify-end border-t bg-muted/10 px-4 py-1.5 text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
          Open
          <ArrowRight
            aria-hidden
            className="ml-1 size-3 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </Link>
  );
}
