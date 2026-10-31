import { format } from 'date-fns';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FOCUS_RING } from '@/components/ds/segmented';
import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { cn } from '@/lib/utils';

/** Every ledger report is in the functional currency (journals post EUR). */
export const LEDGER_CURRENCY = 'EUR';

/** Shared page width + padding for the accounting area. */
export const ACC_PAGE = 'mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10';

/** A table that runs edge to edge inside a SectionCard (cancels its padding). */
export const FLUSH_TABLE = '-mx-4 w-auto max-w-none sm:-mx-5';

/** Table column shown from `sm` up; its content moves under the name on phones. */
export const COL_SM = 'hidden sm:table-cell';
/** Table column shown from `md` up. */
export const COL_MD = 'hidden md:table-cell';
/** Inline note visible on phones only (the hidden columns' content). */
export const PHONE_NOTE = 'mt-0.5 text-xs text-muted-foreground sm:hidden';

export const ACC_CRUMBS = [
  { label: 'Admin', href: '/admin' },
  { label: 'Accounting', href: '/admin/accounting' },
] as const;

/** "2026-10-30" (a date column) → "30 Oct 2026". Unparseable → as given. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : format(d, 'd MMM yyyy');
}

/** Absolute date + time for timestamps: "30 Oct 2026 · 22:30". */
export function formatStamp(d: Date): string {
  return format(d, 'd MMM yyyy · HH:mm');
}

/**
 * Whole-card link (Stage 6G hub card). The title is the only link — its
 * `after:` overlay stretches over the card, so the card is clickable while
 * screen readers hear one link named after the title.
 */
export function HubCard({
  href,
  icon: Icon,
  title,
  description,
  count,
  tone = 'blue',
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  count?: string;
  tone?: DsTone;
}) {
  return (
    <div className="group relative flex min-w-0 items-start gap-3.5 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-colors focus-within:border-primary/40 hover:border-primary/40 sm:p-5">
      <span
        aria-hidden
        className={cn('grid size-10 shrink-0 place-items-center rounded-xl', DS_SOFT[tone])}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="text-[15px] font-semibold text-foreground">
            <Link
              href={href}
              className={cn(
                'rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[""]',
                FOCUS_RING,
                'focus-visible:after:ring-2 focus-visible:after:ring-ring/50',
              )}
            >
              {title}
            </Link>
          </h2>
          {count && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowRight
        aria-hidden
        className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </div>
  );
}

/** Empty / note line inside a section card. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
