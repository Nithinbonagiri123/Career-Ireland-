import { format } from 'date-fns';
import { ArrowRight, ClipboardList, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './segmented';
import { DS_SOFT, type DsTone } from './tones';

/**
 * Stage 6G record workspace (approved mockup 04): breadcrumb, large
 * avatar header with meta line + chips, Next-action banner, underlined
 * tabs and section cards with contextual actions.
 */

export function WorkspaceHeader({
  breadcrumbs,
  avatar,
  title,
  status,
  subtitle,
  meta = [],
  chips = [],
  actions,
}: {
  breadcrumbs: Array<{ label: string; href?: string }>;
  avatar: { initials?: string; icon?: LucideIcon; tone?: DsTone };
  title: string;
  status?: ReactNode;
  subtitle?: ReactNode;
  /** Icon + text items on one wrapping line under the title. */
  meta?: Array<{ key: string; icon: LucideIcon; content: ReactNode; className?: string }>;
  /** Pastel chips under the meta line (owner, type, dates…). */
  chips?: Array<{ key: string; icon: LucideIcon; content: ReactNode; className?: string }>;
  actions?: ReactNode;
}) {
  const Icon = avatar.icon;
  const shownMeta = meta.filter((m) => m.content !== null && m.content !== undefined);
  const shownChips = chips.filter((c) => c.content !== null && c.content !== undefined);
  return (
    <header>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          {breadcrumbs.map((b, i) => (
            <li key={b.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {b.href ? (
                <Link
                  href={b.href}
                  className={cn('rounded-sm hover:text-foreground hover:underline', FOCUS_RING)}
                >
                  {b.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {b.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden
            className={cn(
              'grid size-16 shrink-0 place-items-center rounded-full text-xl font-semibold sm:size-20 sm:text-2xl',
              DS_SOFT[avatar.tone ?? 'blue'],
            )}
          >
            {Icon ? <Icon className="size-7 sm:size-8" /> : avatar.initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-[28px]">
                {title}
              </h1>
              {status}
            </div>
            {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
            {shownMeta.length > 0 && (
              <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-foreground/80">
                {shownMeta.map((m) => {
                  const MIcon = m.icon;
                  return (
                    <li key={m.key} className={cn('inline-flex items-center gap-1.5', m.className)}>
                      <MIcon className="size-4 text-sky-600 dark:text-sky-400" aria-hidden />
                      {m.content}
                    </li>
                  );
                })}
              </ul>
            )}
            {shownChips.length > 0 && (
              <ul className="mt-3 flex flex-wrap items-center gap-2">
                {shownChips.map((c) => {
                  const CIcon = c.icon;
                  return (
                    <li
                      key={c.key}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-foreground/80 shadow-xs',
                        c.className,
                      )}
                    >
                      <CIcon className="size-3.5 text-sky-600 dark:text-sky-400" aria-hidden />
                      {c.content}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        {actions && <div className="shrink-0 lg:pt-1">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * White Next-action banner (mockup 04): labelled chip, one sentence, one
 * button. Keeps the `Next step` landmark name the R1/R2 specs rely on.
 */
export function NextActionBanner({
  label,
  dueHint,
  sentence,
  tone = 'default',
  primary,
  action,
  className,
  testId,
}: {
  label: string;
  dueHint?: string | null;
  sentence: ReactNode;
  /** `muted`: informational, nothing to do right now. */
  tone?: 'default' | 'urgent' | 'muted';
  /** A link action. */
  primary?: { label: string; href: string };
  /** Any other action (dialog trigger, disabled button) instead of a link. */
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const urgent = tone === 'urgent';
  const muted = tone === 'muted';
  return (
    // Sized to its own width (container query), so it stacks in narrow
    // columns and tablets instead of squeezing the sentence.
    <section
      aria-label="Next step"
      data-testid={testId}
      className={cn(
        '@container rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm',
        className,
      )}
    >
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-center">
        <span
          className={cn(
            'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
            urgent
              ? 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30'
              : muted
                ? 'bg-muted text-muted-foreground ring-border'
                : 'bg-sky-50 text-primary ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30',
          )}
        >
          <ClipboardList className="size-3.5" aria-hidden />
          {sentenceCase(label)}
        </span>
        <div className="min-w-0 flex-1 text-sm text-foreground">
          {sentence}
          {dueHint && <span className="ml-2 text-xs text-muted-foreground">· {dueHint}</span>}
        </div>
        {action ? (
          <div className="w-fit shrink-0">{action}</div>
        ) : primary ? (
          <Link
            href={primary.href}
            className={cn(
              buttonVariants({ variant: urgent ? 'default' : 'outline', size: 'sm' }),
              'w-fit shrink-0',
            )}
          >
            {primary.label}
            <ArrowRight className="ml-1 size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** "NEXT STEP" → "Next step" (labels arrive upper-case from next-action rules). */
function sentenceCase(text: string) {
  return text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;
}

/** Underlined text tabs on a white strip (base-ui Tabs class overrides). */
export const DS_TABS_LIST = cn(
  'h-auto w-full max-w-full justify-start gap-0 rounded-2xl border border-border/60 bg-card px-2 shadow-sm',
  '[&>span]:hidden', // base-ui's sliding indicator; the underline is the ::after bar
  // Phones: the strip scrolls; a soft fade marks that more tabs follow.
  '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:[mask-image:none]',
);
export const DS_TAB_TRIGGER = cn(
  'group relative h-12 shrink-0 rounded-none px-3.5 text-sm font-medium text-muted-foreground transition-colors sm:px-4',
  'hover:text-foreground data-[selected]:font-semibold data-[selected]:text-foreground',
  'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[selected]:after:bg-primary',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
);
/** Count badge inside a DS tab (navy when the tab is active). */
export const DS_TAB_COUNT =
  'ml-1.5 rounded-md bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground group-data-[selected]:bg-primary group-data-[selected]:text-primary-foreground';

/** White section card: icon + title (+ count), contextual action, body. */
export function SectionCard({
  icon: Icon,
  title,
  count,
  description,
  action,
  children,
  className,
  bodyClassName,
  testId,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  count?: number;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            {Icon && <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />}
            {title}
            {typeof count === 'number' && (
              <span className="text-sm font-normal text-muted-foreground">({count})</span>
            )}
          </h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className={cn('mt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Label / value rows for section cards (mockup 04 "Personal details"). */
export function DetailRows({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode; icon?: LucideIcon }>;
}) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {rows.map((r) => {
        const RIcon = r.icon;
        return (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-foreground [overflow-wrap:anywhere]">
              {RIcon && <RIcon className="size-3.5 shrink-0 text-sky-600" aria-hidden />}
              {r.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Activity timeline (mockup 04 "Recent activity"): soft icon dot, what
 * happened, who did it, and the absolute date + time on the right.
 */
export function ActivityTimeline({
  items,
  testId,
}: {
  items: Array<{ id: string; title: ReactNode; subtitle?: ReactNode; at: Date | string }>;
  testId?: string;
}) {
  return (
    <ol data-testid={testId} className="relative space-y-1">
      {items.map((a, i) => {
        const at = typeof a.at === 'string' ? new Date(a.at) : a.at;
        return (
          <li key={a.id} className="relative flex gap-3 rounded-xl px-1 py-2.5">
            {i < items.length - 1 && (
              <span
                aria-hidden
                className="absolute bottom-[-0.5rem] left-[1.15rem] top-10 w-px bg-border/70"
              />
            )}
            <span
              aria-hidden
              className={cn('grid size-8 shrink-0 place-items-center rounded-full', DS_SOFT.blue)}
            >
              <span className="size-2 rounded-full bg-current" />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-0.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                  {a.title}
                </p>
                {a.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{a.subtitle}</p>}
              </div>
              <time
                dateTime={at.toISOString()}
                className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
              >
                {format(at, 'd MMM yyyy · HH:mm')}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Row list frame used inside section cards (rounded, hairline dividers). */
export const DS_ROW_LIST =
  'divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60';
export const DS_ROW = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3';
