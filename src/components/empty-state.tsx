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
 * Reusable empty state. Icon medallion floats gently and two concentric
 * rings breathe on a slow ~4s cycle so the room isn't dead — but the
 * animation is pure CSS (keyframes in globals.css) so this stays a
 * Server Component. That matters because callers pass `icon={LucideIcon}`
 * from Server Components, and RSC can't serialize a component reference
 * across a Server → Client boundary.
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
      <div className="relative flex size-14 items-center justify-center">
        {/* Outer breathing ring. */}
        <span
          aria-hidden
          className="animate-breathe-slow absolute inset-[-14px] rounded-full bg-muted/30"
        />
        {/* Middle ring — offset delay so the two aren't in lock-step. */}
        <span
          aria-hidden
          className="animate-breathe-slower absolute inset-[-6px] rounded-full bg-muted/50"
        />
        {/* Icon medallion floats up 2 px and back over 5 s. */}
        <span
          aria-hidden
          className="animate-float-slow relative flex size-14 items-center justify-center rounded-full bg-muted/70"
        >
          <Icon aria-hidden className="size-6 text-muted-foreground" />
        </span>
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
