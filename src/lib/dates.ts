/**
 * Timezone-aware date helpers. Ireland Career Gateway operates in the Europe/Dublin
 * timezone (UTC+0 winter, UTC+1 IST summer). The Vercel/Node runtime is UTC,
 * so any `new Date().toISOString().slice(0, 10)` produces a UTC date that can
 * be one calendar day ahead of what an Irish user considers "today" near
 * midnight local time.
 *
 * All user-facing date-only values (submittedAt, decisionAt, task dueOn dates
 * displayed to staff) should use `todayInDublin()` instead.
 */

const IRISH_TIMEZONE = 'Europe/Dublin';

/**
 * Today's date in Europe/Dublin as a `YYYY-MM-DD` string.
 *
 * Uses the 'en-CA' locale because it produces ISO-8601-shape dates natively
 * without post-processing (`2026-09-03`, not `03/09/2026`).
 */
export function todayInDublin(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IRISH_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Format a `YYYY-MM-DD` date string (or a Date) as `DD/MM/YYYY` for Irish
 * UI display. Null-tolerant: returns an empty string when no date is
 * supplied. Does NOT re-translate the stored value into Dublin time —
 * callers that need the Irish date for prefills should use
 * `todayInDublin()` first and then pass the result in.
 */
export function formatDublinDisplay(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00.000Z`) : date;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IRISH_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Parse a `DD/MM/YYYY` user input back to the `YYYY-MM-DD` wire format
 * the server expects. Returns null on malformed input; callers surface
 * a validation error. Permissive on separators (`/` or `-`) and allows
 * single-digit day/month so operators can type `3/9/2026`.
 */
export function parseDublinDisplay(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = Number.parseInt(d ?? '0', 10);
  const mon = Number.parseInt(mo ?? '0', 10);
  const year = Number.parseInt(y ?? '0', 10);
  if (day < 1 || day > 31 || mon < 1 || mon > 12 || year < 1900 || year > 2100) return null;
  // Round-trip via a UTC Date to validate the day actually exists in the month.
  const probe = new Date(Date.UTC(year, mon - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== mon - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
