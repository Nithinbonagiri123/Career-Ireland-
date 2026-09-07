import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type BreadcrumbTrail = ReadonlyArray<{ label: string; href?: string }>;

export type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  badge?: string;
  action?: ReactNode;
  /**
   * Optional breadcrumb trail rendered above the title. The last item is
   * always the current page (rendered as plain text, ignoring `href`).
   * Prefer omitting the trail on true top-level pages — breadcrumbs are
   * for hierarchical navigation, not decoration.
   */
  breadcrumbs?: BreadcrumbTrail;
  /** Optional slot for summary chips / metadata below the description. */
  meta?: ReactNode;
  className?: string;
};

/**
 * Reused by every page. Consistent title/description/badge/action layout.
 * Never render a bare <h1> in a page — always use this.
 *
 * Layout inspiration: 21st.dev "page-header-2" (@7ovr) — breadcrumbs
 * above the title, status badge inline with the icon, actions on the
 * trailing edge. Adapted to our tokens and lucide icons rather than
 * copied verbatim.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  action,
  breadcrumbs,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3', className)}>
      {breadcrumbs && breadcrumbs.length > 1 && (
        <nav aria-label="Breadcrumb" className="flex items-center">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li
                  // Trails are short (2–4 items) and rarely change identity — using
                  // both label + index for the key keeps duplicate labels safe
                  // without adding synthetic ids to the caller.
                  // biome-ignore lint/suspicious/noArrayIndexKey: composite key with index is stable here
                  key={`${crumb.label}-${i}`}
                  className="inline-flex items-center gap-1"
                >
                  {i > 0 && <span aria-hidden>/</span>}
                  {isLast || !crumb.href ? (
                    <span
                      aria-current={isLast ? 'page' : undefined}
                      className={isLast ? 'font-medium text-foreground' : undefined}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <a
                      href={crumb.href}
                      className="rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {crumb.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
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
          {meta && <div className="mt-3">{meta}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
