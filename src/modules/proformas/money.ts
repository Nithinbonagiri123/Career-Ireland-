/**
 * Decimal-safe money + quantity helpers for the pro-forma composer.
 *
 * Why not just use `Number`? Because `0.1 + 0.2 !== 0.3` and anything
 * financial that goes through float arithmetic eventually drifts off
 * the row the user is looking at by a cent. We stay in integer land
 * (cents for money, milli-units for quantity) for every multiplication
 * / addition, then convert back for display and DB storage.
 *
 * Money and quantity scales:
 *   money    = 2 decimal places → scale 100 (cents)
 *   quantity = 3 decimal places → scale 1_000 (milli-units)
 *
 * All inputs are strings coming from JSON / Postgres. All DB round-trip
 * values are also strings. The int form only lives inside this module.
 */

const MONEY_SCALE = 100;
const QTY_SCALE = 1_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(`money: ${message}`);
    this.name = 'MoneyError';
  }
}

/** Parse a 2-decimal money string to integer cents. Rejects NaN / negative. */
export function moneyToCents(v: string): number {
  const t = v.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) {
    throw new MoneyError(`not a money value: "${v}"`);
  }
  const n = Math.round(Number.parseFloat(t) * MONEY_SCALE);
  if (!Number.isFinite(n)) throw new MoneyError(`not finite: "${v}"`);
  if (n < 0) throw new MoneyError(`negative: "${v}"`);
  return n;
}

/** Format integer cents back to the canonical 2-decimal string. */
export function centsToMoney(cents: number): string {
  if (!Number.isFinite(cents)) throw new MoneyError(`not finite: ${cents}`);
  if (cents < 0) throw new MoneyError(`negative: ${cents}`);
  return (cents / MONEY_SCALE).toFixed(2);
}

/** Parse a 3-decimal quantity string to integer milli-units. Rejects <= 0. */
export function qtyToMilli(v: string): number {
  const t = v.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t)) {
    throw new MoneyError(`not a quantity value: "${v}"`);
  }
  const n = Math.round(Number.parseFloat(t) * QTY_SCALE);
  if (!Number.isFinite(n)) throw new MoneyError(`not finite: "${v}"`);
  if (n <= 0) throw new MoneyError(`not positive: "${v}"`);
  return n;
}

/** Format integer milli-units back to a 3-decimal string. */
export function milliToQty(milli: number): string {
  if (!Number.isFinite(milli)) throw new MoneyError(`not finite: ${milli}`);
  if (milli <= 0) throw new MoneyError(`not positive: ${milli}`);
  return (milli / QTY_SCALE).toFixed(3);
}

/**
 * Line subtotal in cents, rounded half-up to the nearest cent so what
 * the DB stores exactly matches what the printable renders.
 */
export function computeLineSubtotalCents(unitPriceCents: number, quantityMilli: number): number {
  // unit_price_cents is the price per 1.000 units expressed in cents.
  // quantity_milli is the quantity × 1000. Their product is scaled by
  // 1000, so we divide and round to put it back in cents.
  const product = unitPriceCents * quantityMilli;
  return Math.round(product / QTY_SCALE);
}

export function sumCents(parts: readonly number[]): number {
  let total = 0;
  for (const p of parts) {
    if (!Number.isFinite(p) || p < 0) {
      throw new MoneyError(`invalid line amount: ${p}`);
    }
    total += p;
  }
  return total;
}
