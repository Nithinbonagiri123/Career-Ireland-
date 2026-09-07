import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Reusable empty state for any list/table/dashboard tile.
 * Every module's list page should use this — never render a bare "No data" string.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-14 text-center',
        className,
      )}
    >
      {/* Concentric ring around the icon reads like a real product empty
          state (Linear/Vercel) instead of a "no items" placeholder. Both
          rings sit on the muted token so the effect adapts to dark mode. */}
      <div className="relative flex size-14 items-center justify-center rounded-full bg-muted/70 ring-8 ring-muted/30">
        <Icon aria-hidden className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
