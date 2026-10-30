import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * Stage 6G segmented control (scope, date range, Cards/Table): a white
 * tray of compact options, the active one in navy. Trays wrap onto a second
 * line on narrow screens instead of scrolling sideways.
 */
export const SEG_TRAY =
  'inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm';

export const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function segItem(active: boolean, className?: string) {
  return cn(
    'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors',
    FOCUS_RING,
    active
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    className,
  );
}

/**
 * Arrow-key movement between the options of a tablist / toolbar
 * (Left/Right/Up/Down, Home, End). Every option stays in the Tab order too.
 */
export function arrowKeyNav(e: KeyboardEvent<HTMLElement>, selector = '[role="tab"]') {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('disabled'),
  );
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i === -1 || items.length === 0) return;
  e.preventDefault();
  const last = items.length - 1;
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? last
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i - 1 + items.length) % items.length
          : (i + 1) % items.length;
  items[next]?.focus();
}
