import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './segmented';
import { DS_SOFT, type DsTone } from './tones';

/**
 * Stage 6G entity card (approved mockup 03): avatar (initials or icon),
 * status pill + timestamp + menu, title (h3) and subtitle, icon meta rows,
 * a divided stat row, and up to two actions at the bottom.
 */
export function EntityCard({
  avatar,
  status,
  timestamp,
  menu,
  title,
  titleHref,
  subtitle,
  meta,
  stats,
  actions,
  testId,
  ariaLabel,
}: {
  avatar: { initials?: string; icon?: LucideIcon; tone?: DsTone };
  status?: ReactNode;
  timestamp?: ReactNode;
  menu?: ReactNode;
  title: string;
  titleHref?: string;
  subtitle?: ReactNode;
  /** Rows whose `content` is null / undefined / '' are skipped, so missing
   *  data never renders as a placeholder line. */
  meta: Array<{ icon: LucideIcon; content: ReactNode; key: string }>;
  stats?: Array<{ value: ReactNode; label: string }>;
  actions?: ReactNode;
  testId?: string;
  /** Accessible name for the card (e.g. "Candidate Jane Doe"). */
  ariaLabel?: string;
}) {
  const Icon = avatar.icon;
  const rows = meta.filter(
    (m) => m.content !== null && m.content !== undefined && m.content !== '',
  );
  return (
    <article
      data-testid={testId}
      aria-label={ariaLabel}
      className="flex h-full min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold',
            DS_SOFT[avatar.tone ?? 'blue'],
          )}
        >
          {Icon ? <Icon className="size-5" /> : avatar.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="min-w-0">{status}</div>
            <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
              {timestamp}
              {menu}
            </div>
          </div>
          <h3
            title={title}
            className="mt-1.5 line-clamp-2 break-words text-[15px] font-semibold leading-tight text-foreground"
          >
            {titleHref ? (
              <Link href={titleHref} className={cn('rounded-sm hover:underline', FOCUS_RING)}>
                {title}
              </Link>
            ) : (
              title
            )}
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="mt-3.5 space-y-2 text-xs">
          {rows.map((m) => {
            const MIcon = m.icon;
            return (
              <li key={m.key} className="flex min-w-0 items-start gap-2 text-foreground/80">
                <MIcon
                  className="mt-px size-3.5 shrink-0 text-sky-600 dark:text-sky-400"
                  aria-hidden
                />
                <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{m.content}</span>
              </li>
            );
          })}
        </ul>
      )}

      {stats && stats.length > 0 && (
        <dl
          className="mt-4 grid divide-x divide-border/70 border-t border-border/70 pt-3 text-center"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 px-1">
              <dd className="text-sm font-semibold tabular-nums text-foreground">{s.value}</dd>
              <dt className="text-[11px] leading-tight text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}

      {actions && <div className="mt-auto grid grid-cols-2 gap-2 pt-3.5">{actions}</div>}
    </article>
  );
}

/** Outline / tinted action button styles for EntityCard actions. */
export const CARD_ACTION = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted',
  FOCUS_RING,
);
export const CARD_ACTION_TINT = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-100 px-2 py-2 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-200',
  FOCUS_RING,
);

/** Initials from a name / title (max two letters). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2 ? [words[0]?.[0], words[1]?.[0]] : [words[0]?.[0], words[0]?.[1]];
  return letters.filter(Boolean).join('').toUpperCase() || '?';
}

/**
 * Card grid: as many ~15.5rem columns as fit (4 on a desktop content area,
 * 1 on tablet-with-sidebar and phones), so cards never get squeezed.
 */
export function EntityCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] items-stretch gap-4">
      {children}
    </div>
  );
}
