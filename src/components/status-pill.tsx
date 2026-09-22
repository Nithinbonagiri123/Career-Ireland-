import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Semantic status pill. Renders a small tinted pill that draws its
 * colour from the `--status-{tone}` and `--status-{tone}-soft`
 * tokens. Every status indicator in the app — invoice paid, permit
 * approved, task done, requisition open — routes through this
 * component so the mapping from status → tone lives in one place.
 *
 * Prefer this over inlining `<Badge>` with class overrides; the tone
 * mapping should come from `src/lib/badge-variants.ts` (per-entity
 * status → tone table) and get passed in here.
 */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-status-success-soft text-status-success',
  info: 'bg-status-info-soft text-status-info',
  warning: 'bg-status-warning-soft text-status-warning',
  danger: 'bg-status-danger-soft text-status-danger',
  neutral: 'bg-status-neutral-soft text-status-neutral',
};

export function StatusPill({
  tone,
  dot = false,
  className,
  children,
}: {
  tone: StatusTone;
  /** Prepend a small dot in the tone colour. */
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        TONE_CLASS[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'size-1.5 rounded-full',
            tone === 'success' && 'bg-status-success',
            tone === 'info' && 'bg-status-info',
            tone === 'warning' && 'bg-status-warning',
            tone === 'danger' && 'bg-status-danger',
            tone === 'neutral' && 'bg-status-neutral',
          )}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
