import { subMonths } from 'date-fns';
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { serviceCatalogItems } from '@/lib/db/schema/services';

/**
 * Revenue rollup for the Main Dashboard.
 *
 * Data model: revenue is `payments.amount` where `payments.status =
 * 'VERIFIED'`, joined through `service_engagements` to a service
 * catalog item. The stream is derived from which `related_*_id` is set
 * on the engagement:
 *
 *   - relatedPlacementId       → placements
 *   - relatedImmigrationCaseId → immigration
 *   - otherwise                → candidate_services
 *
 * The classification is mutually exclusive: an engagement with both
 * IDs set (shouldn't happen — the modules manage them independently)
 * is bucketed as `placements` per the ordering below, so we never
 * double-count.
 *
 * Multi-currency: the repo has no FX table, so we do NOT roll up
 * across currencies. Totals are returned per-currency for the user
 * to reason about. If EUR is the only currency in play, they see one
 * row per stream; otherwise they see one row per (stream × currency).
 *
 * MoM comparison: the same window is queried again, shifted back by
 * exactly one calendar month (via date-fns `subMonths`, which clamps
 * month-length differences). Result is exposed as `previousTotalsByCurrency`
 * so the UI can render a delta arrow without any date math.
 */

export type RevenueSource = 'candidate_services' | 'placements' | 'immigration';

export type RevenueCurrencyTotal = {
  currencyCode: string;
  total: number;
  count: number;
};

export type RevenueByStream = {
  source: RevenueSource;
  byCurrency: RevenueCurrencyTotal[];
};

export type RevenueServiceRow = {
  serviceCode: string;
  serviceName: string;
  source: RevenueSource;
  currencyCode: string;
  total: number;
  count: number;
};

export type DashboardRevenue = {
  range: { from: Date; to: Date };
  previousRange: { from: Date; to: Date };
  byStream: RevenueByStream[];
  totalsByCurrency: RevenueCurrencyTotal[];
  /** Same shape as `totalsByCurrency` but for the MoM comparison window. */
  previousTotalsByCurrency: RevenueCurrencyTotal[];
  /** All services in the range, sorted DESC by total. UI slices for display. */
  services: RevenueServiceRow[];
};

/**
 * MTD default. Callers pass the parsed URL range; if both bounds are
 * absent, we return the current calendar month so the dashboard has
 * a sensible starting view without requiring params.
 */
export function defaultRevenueRange(input?: { from?: Date; to?: Date }): { from: Date; to: Date } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = input?.from ?? startOfMonth;
  const to = input?.to ?? now;
  return { from, to };
}

function classifySource(row: {
  relatedPlacementId: string | null;
  relatedImmigrationCaseId: string | null;
}): RevenueSource {
  if (row.relatedPlacementId) return 'placements';
  if (row.relatedImmigrationCaseId) return 'immigration';
  return 'candidate_services';
}

type RawRow = {
  currencyCode: string;
  serviceCode: string;
  serviceName: string;
  relatedPlacementId: string | null;
  relatedImmigrationCaseId: string | null;
  count: number;
  total: string;
};

/** One SQL round-trip for a single window; grouped so we can rebucket in-memory. */
async function queryWindow(from: Date, to: Date): Promise<RawRow[]> {
  return db
    .select({
      currencyCode: payments.currencyCode,
      serviceCode: serviceCatalogItems.code,
      serviceName: serviceCatalogItems.name,
      relatedPlacementId: serviceEngagements.relatedPlacementId,
      relatedImmigrationCaseId: serviceEngagements.relatedImmigrationCaseId,
      count: sql<number>`COUNT(${payments.id})::int`,
      total: sql<string>`SUM(${payments.amount})::text`,
    })
    .from(payments)
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, payments.serviceEngagementId))
    .innerJoin(
      serviceCatalogItems,
      eq(serviceCatalogItems.id, serviceEngagements.serviceCatalogItemId),
    )
    .where(
      and(
        eq(payments.status, 'VERIFIED'),
        isNotNull(payments.verifiedAt),
        gte(payments.verifiedAt, from),
        lt(payments.verifiedAt, to),
      ),
    )
    .groupBy(
      payments.currencyCode,
      serviceCatalogItems.code,
      serviceCatalogItems.name,
      serviceEngagements.relatedPlacementId,
      serviceEngagements.relatedImmigrationCaseId,
    );
}

type Aggregate = {
  byStream: RevenueByStream[];
  totalsByCurrency: RevenueCurrencyTotal[];
  services: RevenueServiceRow[];
};

function aggregate(rows: RawRow[]): Aggregate {
  const streamMap = new Map<RevenueSource, Map<string, RevenueCurrencyTotal>>([
    ['candidate_services', new Map()],
    ['placements', new Map()],
    ['immigration', new Map()],
  ]);
  const totalsMap = new Map<string, RevenueCurrencyTotal>();
  const svcMap = new Map<string, RevenueServiceRow>();

  for (const r of rows) {
    const source = classifySource(r);
    const total = Number.parseFloat(r.total);
    if (!Number.isFinite(total)) continue;

    // per-stream × currency
    const streamBucket = streamMap.get(source);
    if (streamBucket) {
      const existing = streamBucket.get(r.currencyCode);
      if (existing) {
        existing.total += total;
        existing.count += r.count;
      } else {
        streamBucket.set(r.currencyCode, {
          currencyCode: r.currencyCode,
          total,
          count: r.count,
        });
      }
    }

    // roll-up (per currency, across streams)
    const totalRow = totalsMap.get(r.currencyCode);
    if (totalRow) {
      totalRow.total += total;
      totalRow.count += r.count;
    } else {
      totalsMap.set(r.currencyCode, {
        currencyCode: r.currencyCode,
        total,
        count: r.count,
      });
    }

    // services — key is (source, service, currency); when the same
    // service serves multiple streams (unusual) each combo is distinct.
    const key = `${source}::${r.serviceCode}::${r.currencyCode}`;
    const existingSvc = svcMap.get(key);
    if (existingSvc) {
      existingSvc.total += total;
      existingSvc.count += r.count;
    } else {
      svcMap.set(key, {
        serviceCode: r.serviceCode,
        serviceName: r.serviceName,
        source,
        currencyCode: r.currencyCode,
        total,
        count: r.count,
      });
    }
  }

  return {
    byStream: Array.from(streamMap.entries()).map(([source, bucket]) => ({
      source,
      byCurrency: Array.from(bucket.values()).sort((a, b) => b.total - a.total),
    })),
    totalsByCurrency: Array.from(totalsMap.values()).sort((a, b) => b.total - a.total),
    services: Array.from(svcMap.values()).sort((a, b) => b.total - a.total),
  };
}

export async function fetchDashboardRevenue(opts?: {
  from?: Date;
  to?: Date;
}): Promise<DashboardRevenue> {
  await requireInternalStaff();
  const range = defaultRevenueRange(opts);
  const previousRange = {
    from: subMonths(range.from, 1),
    to: subMonths(range.to, 1),
  };

  // Two queries — cheap, both hit the same index. Alternative was a
  // CASE-based single query, but the DB round-trip cost is negligible
  // and keeping the aggregation code path identical for both windows
  // is easier to reason about.
  const [currentRows, previousRows] = await Promise.all([
    queryWindow(range.from, range.to),
    queryWindow(previousRange.from, previousRange.to),
  ]);

  const current = aggregate(currentRows);
  const previous = aggregate(previousRows);

  return {
    range,
    previousRange,
    byStream: current.byStream,
    totalsByCurrency: current.totalsByCurrency,
    previousTotalsByCurrency: previous.totalsByCurrency,
    services: current.services,
  };
}
