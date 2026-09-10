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
