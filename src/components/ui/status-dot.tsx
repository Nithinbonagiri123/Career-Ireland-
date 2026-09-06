import { cn } from '@/lib/utils';

/**
 * Small coloured dot used inline with a status label — e.g. availability
 * indicator on a candidate row. Uses the semantic status palette from
 * globals.css so light + dark modes stay coherent without table-specific
 * overrides.
 *
 * For pills, prefer <Badge variant="success"|... /> instead. Use StatusDot
 * only when the label sits on the row background and the pill would feel
 * heavy (dense list views, sidebar counters).
 */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-status-success',
  info: 'bg-status-info',
  warning: 'bg-status-warning',
  danger: 'bg-status-danger',
  neutral: 'bg-status-neutral',
};

export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-1.5 shrink-0 rounded-full', DOT_CLASSES[tone], className)}
    />
  );
}
