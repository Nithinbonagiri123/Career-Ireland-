import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/modules/dashboard/pipelines';

/**
 * Horizontal funnel — one column per stage, height driven by the
 * stage's proportion of the pipeline max. The largest stage sits at
 * full height; empty stages get a faint minimum so the row doesn't
 * read as broken when everything is zero. Numbers use tabular-nums so
 * a growing count doesn't shift the layout.
 */
export function PipelineFunnel({
  title,
  href,
  icon: Icon,
  stages,
}: {
  title: string;
  href: string;
  icon: LucideIcon;
  stages: PipelineStage[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <Link
      href={href}
      className="group block rounded-lg border bg-card transition-all hover:border-foreground/20 hover:shadow-[0_8px_20px_-10px_oklch(0.185_0.012_60/0.14)]"
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
            <Icon className="size-3.5" aria-hidden />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {total} <span className="opacity-60">total</span>
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 px-4 pt-4">
        {stages.map((stage, idx) => {
          const heightPct = Math.max(6, (stage.count / max) * 100);
          const isTerminal = idx === stages.length - 1;
          return (
            <div key={stage.label} className="flex min-w-0 flex-col items-center">
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  role="img"
                  aria-label={`${stage.label}: ${stage.count}`}
                  className={cn(
                    'w-full rounded-t-md transition-all duration-500 ease-out',
                    stage.count === 0 && 'bg-muted/40',
                    stage.count > 0 && !isTerminal && 'bg-foreground/70',
                    stage.count > 0 && isTerminal && 'bg-status-success/80',
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <div className="mt-2 w-full text-center">
                <div className="text-sm font-semibold tabular-nums">{stage.count}</div>
                <div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                  {stage.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connector line beneath the bars — reads as a real funnel. */}
      <div className="mx-4 mt-1 mb-4 h-px bg-border" />
    </Link>
  );
}
