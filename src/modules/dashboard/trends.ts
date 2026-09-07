import { gte, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema/leads';
import { jobApplications, placements } from '@/lib/db/schema/recruitment';

/**
 * Rolling 30-day trend series for the operational dashboard. Each
 * series is one point per day for the last 30 days; each point is a
 * real COUNT from the domain table (leads.createdAt /
 * jobApplications.appliedAt / placements.createdAt) so the chart
 * cannot show fake activity.
 *
 * Zero-count days are backfilled client-side after the query so the
 * x-axis is continuous even on a quiet week. All three series fire
 * in parallel.
 */

export type TrendPoint = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  count: number;
};

export type DashboardTrends = {
  leads: TrendPoint[];
  applications: TrendPoint[];
  placements: TrendPoint[];
};

const DAYS = 30;

/** Backfills zero-count days between `cutoff` and today so the chart
 *  x-axis is continuous. Rows are the raw grouped counts from SQL. */
function backfillDaily(rows: Array<{ date: string; count: number }>): TrendPoint[] {
  const byDay = new Map(rows.map((r) => [r.date, r.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: TrendPoint[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, count: byDay.get(iso) ?? 0 });
  }
  return out;
}

export async function fetchDashboardTrends(): Promise<DashboardTrends> {
  await requireInternalStaff();
  const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  cutoff.setHours(0, 0, 0, 0);

  const [leadRows, appRows, placementRows] = await Promise.all([
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${leads.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(leads)
      .where(gte(leads.createdAt, cutoff))
      .groupBy(sql`date_trunc('day', ${leads.createdAt})`),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${jobApplications.appliedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(jobApplications)
      .where(gte(jobApplications.appliedAt, cutoff))
      .groupBy(sql`date_trunc('day', ${jobApplications.appliedAt})`),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${placements.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(placements)
      .where(gte(placements.createdAt, cutoff))
      .groupBy(sql`date_trunc('day', ${placements.createdAt})`),
  ]);

  return {
    leads: backfillDaily(leadRows),
    applications: backfillDaily(appRows),
    placements: backfillDaily(placementRows),
  };
}
