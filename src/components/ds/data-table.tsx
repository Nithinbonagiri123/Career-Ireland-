import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './segmented';

/**
 * Stage 6G data table. Wide tables scroll inside their own region instead
 * of being clipped by the card (the old `ui/table` + `overflow-hidden` Card
 * bug). The region is keyboard-focusable and labelled so it can be scrolled
 * without a mouse. Totals go in a real <tfoot>; numeric cells are
 * right-aligned tabular figures.
 *
 *   <DsTable label="Journals" caption="Posted journals, newest first" minWidth={720}>
 *     <DsTHead><tr><DsTh>Date</DsTh><DsTh numeric>Amount</DsTh><DsActionsTh /></tr></DsTHead>
 *     <DsTBody>…<DsTr><DsTd>…</DsTd><DsTd numeric>…</DsTd></DsTr></DsTBody>
 *     <DsTFoot>…</DsTFoot>
 *   </DsTable>
 */

/** Card shell shared with SectionCard. */
export const DS_TABLE_CARD = 'min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm';

export function DsTable({
  label,
  caption,
  captionVisible = false,
  minWidth,
  card = true,
  className,
  tableClassName,
  children,
  testId,
}: {
  /** Accessible name of the scroll region (e.g. "Journals table"). */
  label: string;
  /** Table caption — screen-reader only unless `captionVisible`. */
  caption?: ReactNode;
  captionVisible?: boolean;
  /** Minimum table width in px before it scrolls (phones). */
  minWidth?: number;
  /** Wrap in the white Stage 6G card (default). Set false inside a SectionCard. */
  card?: boolean;
  className?: string;
  tableClassName?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard-reachable (WCAG 2.1.1)
      tabIndex={0}
      data-testid={testId}
      className={cn(
        'relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain',
        card && DS_TABLE_CARD,
        FOCUS_RING,
        className,
      )}
    >
      <table
        className={cn('w-full border-collapse text-sm', tableClassName)}
        style={minWidth ? { minWidth } : undefined}
      >
        {caption && (
          <caption
            className={cn(
              captionVisible ? 'px-4 pt-3 text-left text-xs text-muted-foreground' : 'sr-only',
            )}
          >
            {caption}
          </caption>
        )}
        {children}
      </table>
    </section>
  );
}

export function DsTHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead
      className={cn(
        'border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </thead>
  );
}

export function DsTBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={cn('divide-y divide-border/50', className)}>{children}</tbody>;
}

/** Totals row(s) — a real <tfoot>, visually separated and emphasised. */
export function DsTFoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tfoot
      className={cn(
        'border-t-2 border-border/70 bg-muted/30 font-semibold text-foreground',
        className,
      )}
    >
      {children}
    </tfoot>
  );
}

export function DsTr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('align-top', className)}>{children}</tr>;
}

export function DsTh({
  children,
  numeric,
  className,
  scope = 'col',
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  scope?: 'col' | 'row';
}) {
  return (
    <th
      scope={scope}
      className={cn(
        'whitespace-nowrap px-4 py-2.5 font-medium',
        numeric && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Header for an actions column: visually empty, named for screen readers. */
export function DsActionsTh({ label = 'Actions' }: { label?: string }) {
  return (
    <th scope="col" className="w-px px-4 py-2.5">
      <span className="sr-only">{label}</span>
    </th>
  );
}

export function DsTd({
  children,
  numeric,
  className,
  colSpan,
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn('px-4 py-3', numeric && 'whitespace-nowrap text-right tabular-nums', className)}
    >
      {children}
    </td>
  );
}

/**
 * Table from `md` up, card list below — the Payments pattern, generalised.
 * Pass the same rows to both slots; only one is visible at a time, the
 * other is `hidden` (removed from the accessibility tree too).
 */
export function ResponsiveTable({
  table,
  cards,
  className,
}: {
  table: ReactNode;
  cards: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </div>
  );
}

/** Card list for phones: one white card per row. */
export function DsCardList({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cn('grid gap-3', className)}>
      {children}
    </ul>
  );
}

export function DsCardItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li
      className={cn('min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm', className)}
    >
      {children}
    </li>
  );
}
