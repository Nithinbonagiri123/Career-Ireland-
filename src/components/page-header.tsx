import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { NoteTone } from '@/components/note';
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
  /**
   * Sticky-note tone for the icon medallion. When set, the icon is
   * rendered in a rounded coloured square that anchors the page visually
   * — this is the small but repeated cue that ties every page to the
   * design system. When absent, the icon shows inline in muted grey
   * (the previous default), so pages that pre-date this prop stay
   * neutral until they opt in.
   */
  iconTone?: NoteTone;
  className?: string;
};

const NOTE_TONE_CLASS: Record<NoteTone, string> = {
  yellow: 'bg-note-yellow text-note-yellow-ink',
  blue: 'bg-note-blue text-note-blue-ink',
  pink: 'bg-note-pink text-note-pink-ink',
  green: 'bg-note-green text-note-green-ink',
  purple: 'bg-note-purple text-note-purple-ink',
  neutral: 'bg-note-neutral text-note-neutral-ink',
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
  iconTone,
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
        <div className="flex min-w-0 items-start gap-3">
          {Icon &&
            (iconTone ? (
              <span
                className={cn(
                  'grid size-11 shrink-0 place-items-center rounded-xl shadow-sm ring-1 ring-black/5',
                  NOTE_TONE_CLASS[iconTone],
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
            ) : (
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
            ))}
          <div className="min-w-0">
            {badge && (
              <div className="mb-1">
                <Badge variant="secondary" className="rounded-full">
                  {badge}
                </Badge>
              </div>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            )}
            {meta && <div className="mt-3">{meta}</div>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
