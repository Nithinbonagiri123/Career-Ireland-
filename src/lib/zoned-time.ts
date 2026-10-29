/**
 * R3 — wall-clock time in a named timezone ⇄ exact instant.
 *
 * Interviews are stored as an exact instant (`timestamptz`). Staff enter a
 * local date + time plus the timezone the interview happens in (Irish time
 * by default); the server converts that to the instant. Display shows the
 * time in the business timezone (Europe/Dublin) with its offset label, so
 * nobody has to guess what "10:00" meant.
 */

export const BUSINESS_TIMEZONE = 'Europe/Dublin';

/** Timezones offered when scheduling (candidates often interview from abroad). */
export const INTERVIEW_TIMEZONES = [
  { value: 'Europe/Dublin', label: 'Ireland (Dublin)' },
  { value: 'Europe/London', label: 'United Kingdom (London)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Warsaw', label: 'Central Europe (Warsaw)' },
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Asia/Manila', label: 'Philippines (Manila)' },
  { value: 'Africa/Johannesburg', label: 'South Africa (Johannesburg)' },
  { value: 'America/New_York', label: 'US Eastern (New York)' },
] as const;

export function isKnownTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock `YYYY-MM-DDTHH:mm` in `tz` to the exact instant.
 * Returns null for malformed input or a time that does not exist in `tz`
 * (the skipped hour when clocks go forward).
 */
export function zonedLocalToUtc(local: string, tz: string): Date | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m || !isKnownTimezone(tz)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset across DST boundaries.
  let guess = new Date(wallAsUtc - offsetMs(new Date(wallAsUtc), tz));
  guess = new Date(wallAsUtc - offsetMs(guess, tz));
  // Reject non-existent local times (round-trip must reproduce the input).
  if (toZonedLocal(guess, tz) !== local) return null;
  return guess;
}

/** The instant as `YYYY-MM-DDTHH:mm` wall-clock in `tz` (for edit forms). */
export function toZonedLocal(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** e.g. "Tue 3 Nov 2026 · 10:00 GMT" in the business timezone (or `tz`). */
export function formatZoned(instant: Date, tz: string = BUSINESS_TIMEZONE): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(instant);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(instant);
  return `${date} · ${time}`;
}
