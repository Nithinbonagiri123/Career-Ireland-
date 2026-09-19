import type { LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { Badge } from '@/components/ui/badge';
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
    <CardHeader
      className={cn('flex-row items-center justify-between space-y-0', className)}
    >
      <div className="min-w-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="size-4" />}
          <span className="truncate">{title}</span>
          {typeof count === 'number' && (
            <Badge variant="secondary" className="ml-1 rounded-full">
              {count}
            </Badge>
          )}
        </CardTitle>
        {children && (
          <p className="mt-1 text-xs text-muted-foreground">{children}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </CardHeader>
  );
}
