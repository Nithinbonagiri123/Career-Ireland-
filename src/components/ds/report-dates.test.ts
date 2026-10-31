import { describe, expect, it } from 'vitest';
import { isIsoDay, parseDateParam, toIsoDay } from './report-dates';

describe('report date params', () => {
  const fallback = new Date('2026-10-30T00:00:00Z');

  it('accepts real YYYY-MM-DD days and parses them as before', () => {
    expect(isIsoDay('2026-02-28')).toBe(true);
    expect(parseDateParam('2026-03-01', fallback).getTime()).toBe(new Date('2026-03-01').getTime());
  });

  it('falls back on anything else instead of throwing', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'yesterday',
      '2026-02-31',
      '2026-13-01',
      '26-1-1',
      '2026-01-01T00:00',
    ]) {
      expect(isIsoDay(bad)).toBe(false);
      expect(parseDateParam(bad, fallback)).toBe(fallback);
    }
  });

  it('formats local dates for date inputs', () => {
    expect(toIsoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
