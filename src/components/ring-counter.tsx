import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/components/pipeline-chip';

/**
 * Circle-outlined metric counter — a large tabular number ringed by
 * a coloured border, with a lowercase label underneath. Used on the
 * requisition card ("matched · applied · shortlisted") and any
 * future dashboard KPI card.
 *
 * `tone` selects a pipeline colour so a strip of counters reads as a
 * matched palette. Fall back to `neutral` for dashboards where the
 * counters aren't stage-specific.
 */
export type RingCounterTone = PipelineStage | 'neutral';

const RING_CLASS: Record<RingCounterTone, string> = {
  source: 'border-pipeline-source text-pipeline-source',
  review: 'border-pipeline-review text-pipeline-review',
  shortlist: 'border-pipeline-shortlist text-pipeline-shortlist',
  apply: 'border-pipeline-apply text-pipeline-apply',
  interview: 'border-pipeline-interview text-pipeline-interview',
  offer: 'border-pipeline-offer text-pipeline-offer',
  placed: 'border-pipeline-placed text-pipeline-placed',
  blocked: 'border-pipeline-blocked text-pipeline-blocked',
  neutral: 'border-border text-muted-foreground',
};

export function RingCounter({
  label,
  value,
  tone = 'neutral',
  size = 'md',
  className,
}: {
  label: string;
  value: number;
  tone?: RingCounterTone;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div
        className={cn(
          'grid place-items-center rounded-full border-2 bg-card font-mono font-semibold tabular-nums',
          size === 'sm' ? 'size-9 text-xs' : 'size-11 text-sm',
          RING_CLASS[tone],
        )}
      >
        {value}
      </div>
      <span className="text-[10px] lowercase text-muted-foreground">{label}</span>
    </div>
  );
}
