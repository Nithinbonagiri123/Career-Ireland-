import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * Stage 6G money display. One convention for every Finance screen:
 *  - currency symbol, thousands separators, 2 decimals (the same en-IE
 *    formatter as `formatCurrency`, so rounding never differs);
 *  - negatives carry a leading true minus sign: "−€1,234.00";
 *  - tabular figures and no wrapping, so columns line up.
 * Display only — values are never parsed back or stored.
 */

/** U+2212 MINUS SIGN — reads as a minus, aligns with digits. */
export const MINUS = '−';

export type FormatMoneyOptions = {
  /** Always show 2 decimals (default) — set false for whole-unit KPIs. */
  decimals?: boolean;
  /** Prefix positives with "+" (deltas). */
  signed?: boolean;
  /** Shown when the amount is missing or not a number. Default "—". */
  fallback?: string;
};

function toNumber(amount: number | string | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return Number.isFinite(n) ? n : null;
}

/** "−€1,234.00" / "€1,234.00" / "+€5.00" (signed). Invalid → fallback. */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string,
  opts: FormatMoneyOptions = {},
): string {
  const { decimals = true, signed = false, fallback = '—' } = opts;
  const n = toNumber(amount);
  if (n === null) return fallback;
  const options: Intl.NumberFormatOptions = decimals
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
  // Format the magnitude and add our own sign so every screen shows the
  // same minus glyph regardless of the platform's Intl output.
  const abs = formatCurrency(Math.abs(n), currency, options);
  if (!abs) return fallback;
  const isNegative = n < 0 && abs !== formatCurrency(0, currency, options);
  if (isNegative) return `${MINUS}${abs}`;
  if (signed && n > 0) return `+${abs}`;
  return abs;
}

/** Class for a right-aligned numeric table cell or column. */
export const MONEY_CELL = 'text-right tabular-nums whitespace-nowrap';

export function Money({
  amount,
  currency,
  className,
  tone = 'plain',
  signed,
  decimals,
  fallback,
}: {
  amount: number | string | null | undefined;
  currency: string;
  className?: string;
  /** `negative` colours amounts below zero; `plain` never colours. */
  tone?: 'plain' | 'negative';
  signed?: boolean;
  decimals?: boolean;
  fallback?: string;
}) {
  const n = toNumber(amount);
  const text = formatMoney(amount, currency, { signed, decimals, fallback });
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        tone === 'negative' && n !== null && n < 0 && 'text-rose-700 dark:text-rose-300',
        className,
      )}
    >
      {text}
    </span>
  );
}

/**
 * Several currencies, one per line (amounts are never converted or summed
 * across currencies). Empty list → fallback.
 */
export function MoneyStack({
  items,
  className,
  fallback = '—',
}: {
  items: Array<{ currency: string; amount: number | string }>;
  className?: string;
  fallback?: string;
}) {
  if (items.length === 0) {
    return <span className={cn('tabular-nums text-muted-foreground', className)}>{fallback}</span>;
  }
  return (
    <span className={cn('inline-flex flex-col items-end gap-0.5', className)}>
      {items.map((i) => (
        <Money key={i.currency} amount={i.amount} currency={i.currency} />
      ))}
    </span>
  );
}
