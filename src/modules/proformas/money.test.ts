import { describe, expect, it } from 'vitest';
import {
  centsToMoney,
  computeLineSubtotalCents,
  MoneyError,
  milliToQty,
  moneyToCents,
  qtyToMilli,
  sumCents,
} from './money';

/**
 * Decimal-safe arithmetic covering the invariants the pro-forma
 * composer relies on. Written against the public helpers only — the
 * composer and service both use these, so any drift here is a drift
 * the operator and the DB would see.
 */

describe('moneyToCents', () => {
  it('parses canonical 2dp strings', () => {
    expect(moneyToCents('0.00')).toBe(0);
    expect(moneyToCents('0.01')).toBe(1);
    expect(moneyToCents('1234.56')).toBe(123456);
  });
  it('accepts integer and 1dp forms', () => {
    expect(moneyToCents('1000')).toBe(100000);
    expect(moneyToCents('1000.5')).toBe(100050);
  });
  it('rejects >2 decimal places', () => {
    expect(() => moneyToCents('1.234')).toThrow(MoneyError);
  });
  it('rejects non-numeric', () => {
    expect(() => moneyToCents('abc')).toThrow(MoneyError);
    expect(() => moneyToCents('')).toThrow(MoneyError);
  });
  it('rejects negatives', () => {
    expect(() => moneyToCents('-1.00')).toThrow(MoneyError);
  });
});

describe('centsToMoney', () => {
  it('round-trips with moneyToCents', () => {
    for (const s of ['0.00', '0.01', '1.00', '123.45', '99999.99']) {
      expect(centsToMoney(moneyToCents(s))).toBe(s);
    }
  });
  it('rejects negatives + NaN', () => {
    expect(() => centsToMoney(-1)).toThrow(MoneyError);
    expect(() => centsToMoney(Number.NaN)).toThrow(MoneyError);
  });
});

describe('qtyToMilli / milliToQty', () => {
  it('accepts 0.001 as the smallest positive quantity', () => {
    expect(qtyToMilli('0.001')).toBe(1);
    expect(milliToQty(1)).toBe('0.001');
  });
  it('rejects zero and negatives', () => {
    expect(() => qtyToMilli('0')).toThrow(MoneyError);
    expect(() => qtyToMilli('-1')).toThrow(MoneyError);
  });
  it('rejects >3 decimal places', () => {
    expect(() => qtyToMilli('1.1234')).toThrow(MoneyError);
  });
  it('round-trips typical quantities', () => {
    for (const s of ['1.000', '2.500', '0.001', '10.000']) {
      expect(milliToQty(qtyToMilli(s))).toBe(s);
    }
  });
});

describe('computeLineSubtotalCents', () => {
  it('matches basic quantity × price', () => {
    expect(computeLineSubtotalCents(moneyToCents('100.00'), qtyToMilli('2.000'))).toBe(20000);
    expect(computeLineSubtotalCents(moneyToCents('50.50'), qtyToMilli('3.000'))).toBe(15150);
  });
  it('rounds half-up for fractional quantities', () => {
    // 0.333 units × 10.00 cents/unit = 3.33 → 333 cents
    expect(computeLineSubtotalCents(moneyToCents('10.00'), qtyToMilli('0.333'))).toBe(333);
    // 0.5 unit × 1.01 = 0.505 → rounds half-up to 51 cents (Math.round(50.5) = 51)
    expect(computeLineSubtotalCents(moneyToCents('1.01'), qtyToMilli('0.500'))).toBe(51);
  });
  it('never drifts across many lines (float-free summation)', () => {
    // Classic float trap: 0.1 × 10 = 1.0000000000000002 in IEEE 754.
    const unit = moneyToCents('0.10');
    const qty = qtyToMilli('10.000');
    const line = computeLineSubtotalCents(unit, qty);
    expect(line).toBe(100);
    expect(centsToMoney(line)).toBe('1.00');
  });
});

describe('sumCents', () => {
  it('sums line subtotals exactly', () => {
    const lines = [
      computeLineSubtotalCents(moneyToCents('99.99'), qtyToMilli('1.000')),
      computeLineSubtotalCents(moneyToCents('0.01'), qtyToMilli('1.000')),
      computeLineSubtotalCents(moneyToCents('100.00'), qtyToMilli('2.500')),
    ];
    const total = sumCents(lines);
    expect(centsToMoney(total)).toBe('350.00');
  });
  it('rejects negatives', () => {
    expect(() => sumCents([100, -1, 5])).toThrow(MoneyError);
  });
});
