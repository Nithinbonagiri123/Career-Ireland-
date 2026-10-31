import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@/lib/currency';
import { formatMoney, MINUS } from './money';

describe('formatMoney', () => {
  it('formats positives exactly like formatCurrency (same rounding)', () => {
    for (const v of [0.005, 1.005, 2.675, 1234.5, 999999.995, 12.345]) {
      expect(formatMoney(v, 'EUR')).toBe(
        formatCurrency(v, 'EUR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      );
    }
  });

  it('handles Postgres NUMERIC strings', () => {
    expect(formatMoney('1234.5', 'EUR')).toBe('€1,234.50');
    expect(formatMoney('250', 'EUR')).toBe('€250.00');
  });

  it('uses one negative convention: leading minus sign', () => {
    expect(formatMoney(-1234, 'EUR')).toBe(`${MINUS}€1,234.00`);
    expect(formatMoney('-0.5', 'EUR')).toBe(`${MINUS}€0.50`);
  });

  it('never shows a negative zero', () => {
    expect(formatMoney(-0, 'EUR')).toBe('€0.00');
    expect(formatMoney(-0.001, 'EUR')).toBe('€0.00');
  });

  it('formats zero and large numbers', () => {
    expect(formatMoney(0, 'EUR')).toBe('€0.00');
    expect(formatMoney(1234567890.12, 'EUR')).toBe('€1,234,567,890.12');
  });

  it('supports EUR, USD and GBP', () => {
    expect(formatMoney(10, 'EUR')).toBe('€10.00');
    expect(formatMoney(10, 'USD')).toBe('US$10.00');
    expect(formatMoney(10, 'GBP')).toBe('£10.00');
  });

  it('signed adds a plus to positives only', () => {
    expect(formatMoney(5, 'EUR', { signed: true })).toBe('+€5.00');
    expect(formatMoney(-5, 'EUR', { signed: true })).toBe(`${MINUS}€5.00`);
    expect(formatMoney(0, 'EUR', { signed: true })).toBe('€0.00');
  });

  it('whole-unit option', () => {
    expect(formatMoney(1234.56, 'EUR', { decimals: false })).toBe('€1,235');
  });

  it('falls back on missing or invalid input', () => {
    expect(formatMoney(null, 'EUR')).toBe('—');
    expect(formatMoney(undefined, 'EUR')).toBe('—');
    expect(formatMoney('', 'EUR')).toBe('—');
    expect(formatMoney('abc', 'EUR')).toBe('—');
    expect(formatMoney(Number.NaN, 'EUR', { fallback: 'n/a' })).toBe('n/a');
  });
});
