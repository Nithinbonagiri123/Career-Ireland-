import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  badge?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Reused by every page. Consistent title/description/badge/action layout.
 * Never render a bare <h1> in a page — always use this.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {(Icon || badge) && (
          <div className="mb-1 flex items-center gap-2">
            {Icon && <Icon className="size-4 text-muted-foreground" />}
            {badge && (
              <Badge variant="secondary" className="rounded-full">
                {badge}
              </Badge>
            )}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
