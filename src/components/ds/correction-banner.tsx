import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The amber "Need to correct the amount?" note on finance documents.
 * Callers supply the copy (it depends on the document's state); hidden
 * when printing.
 */
export function CorrectionBanner({
  title = 'Need to correct the amount?',
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label="How to correct this document"
      className={cn(
        'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-sm print:hidden dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
        className,
      )}
    >
      <strong className="font-semibold">{title}</strong> {children}
    </aside>
  );
}
