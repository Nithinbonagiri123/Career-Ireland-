import { and, gte, lte, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Server-side helpers for the URL-driven date-range filter used on every
 * list page. The client counterpart is `<DateRangeFilter />`.
 *
 * URL param shape:
 *   - `?created=7d|30d|90d`         → preset "last N days" (from = now-N, to omitted)
 *   - `?from=YYYY-MM-DD&to=YYYY-MM-DD` → custom range (either bound optional)
 *   - (nothing)                     → no filter (Anytime)
 *
 * The preset and custom forms are mutually exclusive — the client clears
 * one when writing the other, and this parser honours that.
 */

export type DateRange = { from?: Date; to?: Date };

export type DateRangeParams = {
  created?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

const PRESETS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Read the created/from/to search params and normalise into a
 * `{ from, to }` window. Invalid values are silently ignored so a
 * malformed URL doesn't blow the page up.
 */
export function parseDateRangeParams(params: DateRangeParams): DateRange {
  const preset = params.created;
  if (preset && preset in PRESETS) {
    const days = PRESETS[preset] as number;
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);
    return { from };
  }
  const result: DateRange = {};
  if (params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    const d = new Date(`${params.from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) result.from = d;
  }
  if (params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    // End-of-day inclusive so "to 2026-09-12" catches events at 23:59.
    const d = new Date(`${params.to}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) result.to = d;
  }
  return result;
}

/**
 * Build a drizzle WHERE condition for the range against a timestamp
 * column. Returns `undefined` if the range is empty so callers can
 * combine safely with `and(...)` via a `.filter(Boolean)`.
 */
export function dateRangeWhere(column: PgColumn, range: DateRange): SQL | undefined {
  const conds: SQL[] = [];
  if (range.from) conds.push(gte(column, range.from));
  if (range.to) conds.push(lte(column, range.to));
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return and(...conds);
}
