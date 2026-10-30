import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The Card + Icon + Title + count-badge + description + right-hand action
 * header pattern every panel duplicates. Instead of every panel writing:
 *
 *   <CardHeader className="flex-row items-center justify-between space-y-0">
 *     <div>
 *       <CardTitle className="flex items-center gap-2 text-base">
 *         <Icon className="size-4" /> Title <Badge>{count}</Badge>
 *       </CardTitle>
 *       <p className="mt-1 text-xs text-muted-foreground">description</p>
 *     </div>
 *     <Actions />
 *   </CardHeader>
 *
 * they now render:
 *
 *   <SectionHeader icon={Icon} title="Title" count={rows.length} action={<Actions/>}>
 *     description
 *   </SectionHeader>
 *
 * Kept inside a Card by the caller — this component only renders the
 * CardHeader row so the caller retains control of CardContent structure.
 */
export function SectionHeader({
  icon: Icon,
  title,
  count,
  action,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  /** Small rounded count badge next to the title (e.g. rows.length). */
  count?: number;
  /** Right-aligned action node (button, dropdown, etc.). */
  action?: React.ReactNode;
  className?: string;
  /** Description paragraph rendered under the title. */
  children?: React.ReactNode;
}) {
  return (
    // Stage 6G (mockup 04 section cards): CardHeader is a grid, so `flex`
    // is required for the action to sit on the title row.
    <CardHeader
      className={cn('flex flex-wrap items-start justify-between gap-2 space-y-0', className)}
    >
      <div className="min-w-0 flex-1">
        <CardTitle className="flex items-center gap-2 text-[15px] font-semibold">
          {Icon && <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />}
          <span className="truncate">{title}</span>
          {typeof count === 'number' && (
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              ({count})
            </span>
          )}
        </CardTitle>
        {children && <p className="mt-1 text-xs text-muted-foreground">{children}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </CardHeader>
  );
}
