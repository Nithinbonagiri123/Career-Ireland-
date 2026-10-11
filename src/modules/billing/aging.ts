import { and, eq, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';

/**
 * Fallback window used for invoices that were created before dueAt
 * existed (Phase 3 blueprint §7.2 migration landed in 0044_due_at.sql).
 * New invoices carry their own dueAt computed from
 * `employer.paymentTermsDays ?? appSettings.defaultPaymentTermsDays`.
 * Historical rows have NULL dueAt — this constant is only consulted
 * for those legacy invoices.
 */
export const LEGACY_OVERDUE_THRESHOLD_DAYS = 14;
/** @deprecated kept for callers migrated incrementally; prefer dueAt + fallback. */
export const OVERDUE_THRESHOLD_DAYS = LEGACY_OVERDUE_THRESHOLD_DAYS;

export function isInvoiceOverdue(
  invoice: { status: string; issuedAt: Date; dueAt?: Date | null },
  today: Date = new Date(),
): boolean {
  if (invoice.status !== 'ISSUED') return false;
  if (invoice.dueAt) {
    return today.getTime() > invoice.dueAt.getTime();
  }
  // Legacy invoice without dueAt — fall back to the historical window.
  const days = Math.floor((today.getTime() - invoice.issuedAt.getTime()) / (1000 * 60 * 60 * 24));
  return days >= LEGACY_OVERDUE_THRESHOLD_DAYS;
}

/**
 * Aging report for the dashboard. Buckets every currently-ISSUED
 * invoice by how many days it's been outstanding and returns per-
 * bucket count + summed total, split by currency (no FX table).
 *
 *   current   — 0-13 days since issued (within tolerance)
 *   d14_30    — 14-30
 *   d31_60    — 31-60
 *   d60_plus  — 60+
 *
 * The dashboard highlights everything from d14_30 onwards as overdue;
 * `current` is shown alongside for context (how much "healthy" AR is
 * in the pipeline).
 */
export type AgingBucket = 'current' | 'd14_30' | 'd31_60' | 'd60_plus';

export type AgingCurrencyTotal = {
  currencyCode: string;
  count: number;
  total: string;
};

export type AgingReport = {
  buckets: Record<AgingBucket, AgingCurrencyTotal[]>;
  /** Sum of overdue (d14_30 + d31_60 + d60_plus) per currency, precomputed for the card headline. */
  overdueTotals: AgingCurrencyTotal[];
};

const EMPTY_BUCKET_MAP: Record<AgingBucket, AgingCurrencyTotal[]> = {
  current: [],
  d14_30: [],
  d31_60: [],
  d60_plus: [],
};

export async function fetchAgingReport(): Promise<AgingReport> {
  await requireInternalStaff();
  // Phase 3 blueprint §7.2 — bucket off dueAt where set, else fall
  // back to `issuedAt + 14 days`. We define `effective_due` with
  // COALESCE and bucket off `NOW() - effective_due`:
  //   current  = not yet due (effective_due in the future)
  //   d14_30   = overdue 1-30 days
  //   d31_60   = overdue 31-60 days
  //   d60_plus = overdue 61+ days
  const bucketExpr = sql<AgingBucket>`
    CASE
      WHEN COALESCE(${invoices.dueAt}, ${invoices.issuedAt} + INTERVAL '14 days') > NOW() THEN 'current'
      WHEN NOW() - COALESCE(${invoices.dueAt}, ${invoices.issuedAt} + INTERVAL '14 days') < INTERVAL '31 days' THEN 'd14_30'
      WHEN NOW() - COALESCE(${invoices.dueAt}, ${invoices.issuedAt} + INTERVAL '14 days') < INTERVAL '61 days' THEN 'd31_60'
      ELSE 'd60_plus'
    END
  `;
  const rows = await db
    .select({
      bucket: bucketExpr,
      currencyCode: invoices.currencyCode,
      count: sql<number>`COUNT(*)::int`,
      total: sql<string>`SUM(${invoices.totalAmount})::text`,
    })
    .from(invoices)
    .where(and(eq(invoices.status, 'ISSUED')))
    .groupBy(bucketExpr, invoices.currencyCode);

  const buckets: Record<AgingBucket, AgingCurrencyTotal[]> = { ...EMPTY_BUCKET_MAP };
  for (const b of ['current', 'd14_30', 'd31_60', 'd60_plus'] as AgingBucket[]) {
    buckets[b] = [];
  }
  for (const r of rows) {
    buckets[r.bucket].push({
      currencyCode: r.currencyCode,
      count: r.count,
      total: r.total,
    });
  }

  // Sum overdue buckets per currency for the headline.
  const overdueByCurrency = new Map<string, { count: number; totalCents: number }>();
  for (const b of ['d14_30', 'd31_60', 'd60_plus'] as AgingBucket[]) {
    for (const row of buckets[b]) {
      const entry = overdueByCurrency.get(row.currencyCode) ?? { count: 0, totalCents: 0 };
      entry.count += row.count;
      entry.totalCents += Math.round(Number.parseFloat(row.total) * 100);
      overdueByCurrency.set(row.currencyCode, entry);
    }
  }
  const overdueTotals: AgingCurrencyTotal[] = Array.from(
    overdueByCurrency,
    ([currencyCode, v]) => ({
      currencyCode,
      count: v.count,
      total: (v.totalCents / 100).toFixed(2),
    }),
  );

  return { buckets, overdueTotals };
}
