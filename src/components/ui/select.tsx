import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Styled native `<select>` element. Every dialog was hand-rolling the
 * same `className="h-9 w-full rounded-md border border-input …"` string
 * — that duplication is now here.
 *
 * Uses the native element (not Base UI) so it composes with
 * `react-hook-form`'s `register()` without a wrapper — most callers
 * spread `{...register('field')}` directly onto this.
 *
 * Matches `<Input />` visually so a form mixing text inputs and
 * dropdowns looks coherent.
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
