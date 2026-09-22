import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Pipeline stage chip. Renders a soft-tinted pill using the
 * `--pipeline-{stage}` and `--pipeline-{stage}-soft` tokens.
 *
 * Every place a candidate's position in the funnel is shown — the
 * requisition card counters, the Pipeline Wall band headers, the
 * candidate detail timeline — routes through this component so the
 * mapping from stage → colour is defined exactly once.
 *
 * Optional `count` renders a small tabular-numerals badge next to
 * the label, matching the "matched · 95" style used across the app.
 */
export type PipelineStage =
  | 'source'
  | 'review'
  | 'shortlist'
  | 'apply'
  | 'interview'
  | 'offer'
  | 'placed'
  | 'blocked';

/**
 * Human label + Tailwind class map for each stage. Kept in one
 * object so callers can iterate over stages in a known order
 * without owning the label / colour association themselves.
 */
export const PIPELINE_STAGES: Record<
  PipelineStage,
  { label: string; className: string; solidClassName: string }
> = {
  source: {
    label: 'Matched',
    className: 'bg-pipeline-source-soft text-pipeline-source',
    solidClassName: 'bg-pipeline-source text-white',
  },
  review: {
    label: 'Reviewed',
    className: 'bg-pipeline-review-soft text-pipeline-review',
    solidClassName: 'bg-pipeline-review text-white',
  },
  shortlist: {
    label: 'Shortlisted',
    className: 'bg-pipeline-shortlist-soft text-pipeline-shortlist',
    solidClassName: 'bg-pipeline-shortlist text-white',
  },
  apply: {
    label: 'Applied',
    className: 'bg-pipeline-apply-soft text-pipeline-apply',
    solidClassName: 'bg-pipeline-apply text-white',
  },
  interview: {
    label: 'Interview',
    className: 'bg-pipeline-interview-soft text-pipeline-interview',
    solidClassName: 'bg-pipeline-interview text-white',
  },
  offer: {
    label: 'Offer',
    className: 'bg-pipeline-offer-soft text-pipeline-offer',
    solidClassName: 'bg-pipeline-offer text-white',
  },
  placed: {
    label: 'Placed',
    className: 'bg-pipeline-placed-soft text-pipeline-placed',
    solidClassName: 'bg-pipeline-placed text-white',
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-pipeline-blocked-soft text-pipeline-blocked',
    solidClassName: 'bg-pipeline-blocked text-white',
  },
};

export function PipelineChip({
  stage,
  count,
  variant = 'soft',
  className,
  children,
}: {
  stage: PipelineStage;
  /** Optional count badge appended after the label. */
  count?: number;
  /** `soft` = tinted background, dark ink (default). `solid` = filled base colour, white ink. */
  variant?: 'soft' | 'solid';
  className?: string;
  /** Override the label. Defaults to `PIPELINE_STAGES[stage].label`. */
  children?: React.ReactNode;
}) {
  const meta = PIPELINE_STAGES[stage];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        variant === 'soft' ? meta.className : meta.solidClassName,
        className,
      )}
    >
      <span className="truncate">{children ?? meta.label}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'grid min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] tabular-nums',
            variant === 'soft' ? 'bg-white/70' : 'bg-white/25',
          )}
        >
          {count}
        </span>
      )}
    </span>
  );
}
