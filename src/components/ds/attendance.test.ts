import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_STATE,
  attendanceStates,
  formatDateTime,
  formatDay,
  formatDuration,
} from './attendance';

const H = 60 * 60 * 1000;

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [59_999, '0m'],
    [60_000, '1m'],
    [45 * 60_000, '45m'],
    [H, '1h 00m'],
    [3 * H + 5 * 60_000, '3h 05m'],
    [-5_000, '0m'],
  ])('%i ms → %s', (ms, out) => {
    expect(formatDuration(ms)).toBe(out);
  });
});

describe('absolute date formats include the year', () => {
  const d = new Date(2026, 9, 30, 9, 7);
  it('date + time', () => expect(formatDateTime(d)).toBe('Fri 30 Oct 2026 · 09:07'));
  it('date only', () => expect(formatDay(d)).toBe('Fri 30 Oct 2026'));
});

describe('attendanceStates', () => {
  const now = new Date(2026, 9, 30, 12, 0);
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * H);

  it('open session → Working, or On break', () => {
    expect(attendanceStates({ clockInAt: at(2), clockOutAt: null, now })).toEqual(['working']);
    expect(attendanceStates({ clockInAt: at(2), clockOutAt: null, onBreak: true, now })).toEqual([
      'on_break',
    ]);
  });

  it('open longer than the auto-close window → Missing clock-out', () => {
    expect(attendanceStates({ clockInAt: at(15), clockOutAt: null, now })).toEqual([
      'missing_clock_out',
    ]);
    expect(attendanceStates({ clockInAt: at(13), clockOutAt: null, now })).toEqual(['working']);
  });

  it('closed session → Clocked out, Auto-closed and/or Corrected', () => {
    const closed = { clockInAt: at(9), clockOutAt: at(1), now };
    expect(attendanceStates(closed)).toEqual(['clocked_out']);
    expect(attendanceStates({ ...closed, autoClosed: true })).toEqual(['auto_closed']);
    expect(attendanceStates({ ...closed, correctionReason: 'forgot' })).toEqual(['corrected']);
    expect(attendanceStates({ ...closed, autoClosed: true, correctionReason: 'x' })).toEqual([
      'auto_closed',
      'corrected',
    ]);
  });

  it('every state has a text label and a tone (never colour alone)', () => {
    for (const [key, def] of Object.entries(ATTENDANCE_STATE)) {
      expect(def.label.length, key).toBeGreaterThan(1);
      expect(def.tone, key).toBeTruthy();
    }
  });
});
