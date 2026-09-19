/**
 * Currency + money formatters. Owned centrally so a change to locale or
 * digit handling propagates to every printable and every table.
 *
 * Locale is `en-IE` (Ireland) — the CRM's primary market. If a customer
 * needs a different locale we'll thread that through the same helper
 * rather than sprinkling `new Intl.NumberFormat('en-IE', …)` calls
 * across pages.
 */

const LOCALE = 'en-IE';

/** Memoise per-currency formatters — creating one on every render is expensive. */
const cache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${currency}::${options ? JSON.stringify(options) : ''}`;
  let fmt = cache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      ...options,
    });
    cache.set(key, fmt);
  }
  return fmt;
}

/**
 * Format an amount + ISO currency code as a localised money string.
 * Accepts either a number or a numeric string (Postgres NUMERIC comes
 * across as a string — treat both).
 *
 *   formatCurrency(1234.5, 'EUR')  → '€1,234.50'
 *   formatCurrency('750', 'ZAR')   → 'ZAR 750.00'
 */
export function formatCurrency(
  amount: number | string,
  currency: string,
  options?: Intl.NumberFormatOptions,
): string {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return '';
  return getFormatter(currency, options).format(n);
}
