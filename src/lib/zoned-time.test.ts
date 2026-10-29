import { describe, expect, it } from 'vitest';
import { formatZoned, toZonedLocal, zonedLocalToUtc } from './zoned-time';

describe('zonedLocalToUtc', () => {
  it('Irish winter time is UTC+0', () => {
    expect(zonedLocalToUtc('2026-12-01T10:00', 'Europe/Dublin')?.toISOString()).toBe(
      '2026-12-01T10:00:00.000Z',
    );
  });

  it('Irish summer time is UTC+1', () => {
    expect(zonedLocalToUtc('2026-07-01T10:00', 'Europe/Dublin')?.toISOString()).toBe(
      '2026-07-01T09:00:00.000Z',
    );
  });

  it('other zones convert correctly (Kolkata +05:30, New York −04:00 in summer)', () => {
    expect(zonedLocalToUtc('2026-07-01T10:00', 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-07-01T04:30:00.000Z',
    );
    expect(zonedLocalToUtc('2026-07-01T10:00', 'America/New_York')?.toISOString()).toBe(
      '2026-07-01T14:00:00.000Z',
    );
  });

  it('rejects the skipped hour when clocks go forward (29 Mar 2026, 01:30 Dublin)', () => {
    expect(zonedLocalToUtc('2026-03-29T01:30', 'Europe/Dublin')).toBeNull();
  });

  it('rejects malformed input and unknown zones', () => {
    expect(zonedLocalToUtc('2026-13-01T10:00', 'Europe/Dublin')).toBeNull();
    expect(zonedLocalToUtc('01/12/2026 10:00', 'Europe/Dublin')).toBeNull();
    expect(zonedLocalToUtc('2026-12-01T10:00', 'Mars/Olympus')).toBeNull();
  });

  it('round-trips through toZonedLocal', () => {
    const instant = zonedLocalToUtc('2026-10-25T09:15', 'Europe/Dublin');
    expect(instant && toZonedLocal(instant, 'Europe/Dublin')).toBe('2026-10-25T09:15');
  });
});

describe('formatZoned', () => {
  it('labels the offset so the time is unambiguous', () => {
    const s = formatZoned(new Date('2026-07-01T09:00:00Z'));
    expect(s).toContain('10:00');
    expect(s).toMatch(/IST|GMT\+1|BST/);
  });
});
