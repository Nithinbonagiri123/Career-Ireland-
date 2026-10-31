import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Money } from './money';

/**
 * Subtotal / VAT / total / paid / outstanding as a definition list.
 * Display only: callers pass the amounts they already compute — this never
 * adds, subtracts or rounds.
 */
export type AmountSummaryLine = {
  key: string;
  label: ReactNode;
  amount: number | string | null | undefined;
  /** `total` and `outstanding` are emphasised; `muted` for secondary lines. */
  emphasis?: 'total' | 'outstanding' | 'muted';
  hint?: ReactNode;
};

/** Display decision only — true when the amount reads as greater than zero. */
function owes(amount: AmountSummaryLine['amount']): boolean {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

export function AmountSummary({
  currency,
  lines,
  className,
  label = 'Amount summary',
}: {
  currency: string;
  lines: AmountSummaryLine[];
  className?: string;
  label?: string;
}) {
  return (
    <dl aria-label={label} className={cn('grid gap-1.5 text-sm', className)}>
      {lines.map((l) => (
        <div
          key={l.key}
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5',
            l.emphasis === 'total' && 'mt-1 border-t border-border/70 pt-2 text-base font-semibold',
            // Amber only while something is still owed; settled reads as plain bold.
            l.emphasis === 'outstanding' && !owes(l.amount) && 'font-semibold',
            l.emphasis === 'outstanding' &&
              owes(l.amount) &&
              'rounded-lg bg-amber-50 px-2 py-1.5 font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200',
            l.emphasis === 'muted' && 'text-muted-foreground',
          )}
        >
          <dt className="min-w-0">
            {l.label}
            {l.hint && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">{l.hint}</span>
            )}
          </dt>
          <dd className="ml-auto">
            <Money amount={l.amount} currency={currency} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
