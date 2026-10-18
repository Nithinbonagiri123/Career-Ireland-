import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDublinDisplay, parseDublinDisplay, plusDaysInDublin, todayInDublin } from './dates';

/**
 * The immigration case status change writes `submittedAt` / `decisionAt` using
 * this helper. If it produced a UTC date instead of a Dublin date, a case
 * "submitted" at 23:30 IST on 31-Jul would be recorded as 30-Jul UTC and
 * shown to Irish staff as the wrong day.
 */
describe('todayInDublin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an ISO YYYY-MM-DD string', () => {
    const result = todayInDublin();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('produces a real, parseable date', () => {
    const result = todayInDublin();
    const parsed = new Date(`${result}T12:00:00Z`);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  it('returns Dublin day even when UTC has already rolled over', () => {
    // 2026-07-14 23:15 UTC = 2026-07-15 00:15 IST (Dublin is UTC+1 in July).
    // A UTC-based slice would return 2026-07-14; Dublin has already rolled to 15.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T23:15:00.000Z'));
    expect(todayInDublin()).toBe('2026-07-15');
  });

  it('returns the same day in Dublin as UTC when both align (January midnight)', () => {
    // 2026-01-15 00:30 UTC = 2026-01-15 00:30 GMT (Dublin is UTC in winter).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:30:00.000Z'));
    expect(todayInDublin()).toBe('2026-01-15');
  });

  it('returns the previous Dublin day when Dublin is UTC and UTC has rolled over just barely', () => {
    // 2026-02-01 00:00 UTC = 2026-02-01 00:00 GMT — both same day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    expect(todayInDublin()).toBe('2026-02-01');
  });
});

/**
 * Stage 6E Section 5 — DD/MM/YYYY display + parse round-trip.
 */
describe('formatDublinDisplay', () => {
  it('formats a YYYY-MM-DD string into DD/MM/YYYY', () => {
    expect(formatDublinDisplay('2026-10-18')).toBe('18/10/2026');
  });

  it('returns empty string on null / undefined / empty', () => {
    expect(formatDublinDisplay(null)).toBe('');
    expect(formatDublinDisplay(undefined)).toBe('');
    expect(formatDublinDisplay('')).toBe('');
  });
});

describe('parseDublinDisplay', () => {
  it('parses DD/MM/YYYY into YYYY-MM-DD', () => {
    expect(parseDublinDisplay('18/10/2026')).toBe('2026-10-18');
  });

  it('accepts single-digit day / month', () => {
    expect(parseDublinDisplay('3/9/2026')).toBe('2026-09-03');
  });

  it('rejects invalid calendar dates (31 Feb)', () => {
    expect(parseDublinDisplay('31/02/2026')).toBeNull();
  });

  it('rejects malformed inputs', () => {
    expect(parseDublinDisplay('not a date')).toBeNull();
    expect(parseDublinDisplay('18-10-26')).toBeNull();
    expect(parseDublinDisplay('2026-10-18')).toBeNull(); // ISO shape, not DD/MM/YYYY
  });
});

/**
 * Stage 6E+1 Section 5 — DST-safe `+n days` arithmetic. Validates that
 * the delta is calendar-days from the Dublin "today", independent of
 * UTC clock drift near midnight and independent of DST transitions.
 */
describe('plusDaysInDublin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today when n = 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T10:00:00.000Z'));
    expect(plusDaysInDublin(0)).toBe(todayInDublin());
  });

  it('adds 90 days from Dublin today (July — IST, UTC+1)', () => {
    // Dublin today = 2026-07-15 (23:15 UTC rolls to 00:15 IST next day).
    // Dublin + 90d = 2026-10-13.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T23:15:00.000Z'));
    expect(plusDaysInDublin(90)).toBe('2026-10-13');
  });

  it('crosses the IST→GMT autumn DST boundary without losing a day', () => {
    // Dublin DST ends on the last Sunday of October (2026-10-25). Add
    // 10 days from Oct 20 should land on Oct 30, not Oct 29 (which
    // would happen if we added 10×24h in ms and the clock went back).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    expect(plusDaysInDublin(10)).toBe('2026-10-30');
  });

  it('crosses the GMT→IST spring DST boundary without gaining a day', () => {
    // Dublin DST starts on the last Sunday of March (2026-03-29). Add
    // 10 days from Mar 25 should land on Apr 4.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00.000Z'));
    expect(plusDaysInDublin(10)).toBe('2026-04-04');
  });
});
