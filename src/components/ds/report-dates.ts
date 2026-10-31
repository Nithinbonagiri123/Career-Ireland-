/**
 * URL date params for finance reports (`?asOf=`, `?from=&to=`). Server-safe.
 * Only strict YYYY-MM-DD values that name a real calendar day are used;
 * anything else falls back, so a bad link never throws a RangeError while
 * formatting. Valid values parse exactly as before (`new Date('YYYY-MM-DD')`).
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDay(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = ISO_DAY.exec(value);
  if (!m) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  // Reject rollovers such as 2026-02-31.
  return d.toISOString().slice(0, 10) === value;
}

export function parseDateParam(value: string | null | undefined, fallback: Date): Date {
  return isIsoDay(value) ? new Date(value) : fallback;
}

/** Date → "YYYY-MM-DD" in the viewer's local calendar (for date inputs). */
export function toIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
