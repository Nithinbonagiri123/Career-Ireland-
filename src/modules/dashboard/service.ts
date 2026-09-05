import { and, between, eq, gt, isNull, lte, ne, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { advertisements } from '@/lib/db/schema/campaigns';
import { payments, serviceEngagements } from '@/lib/db/schema/commerce';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions, placements } from '@/lib/db/schema/recruitment';

export type DashboardMetrics = {
  candidates: {
    total: number;
    available: number;
    placed: number;
    inactive: number;
  };
  leads: {
    total: number;
    awaitingPayment: number;
    lastSevenDays: number;
  };
  employers: {
    total: number;
    active: number;
  };
  requisitions: {
    open: number;
    inProgress: number;
    filledLast30Days: number;
    totalPositionsOpen: number;
  };
  placements: {
    activeConfirmed: number;
    createdLast30Days: number;
  };
  payments: {
    awaitingVerification: number;
    verifiedLast30Days: number;
  };
  immigration: {
    open: number;
    submitted: number;
    expiringWithin60Days: number;
  };
  ads: {
    active: number;
    expiringWithin30Days: number;
    expired: number;
  };
  tasks: {
    open: number;
    overdue: number;
    dueThisWeek: number;
  };
};

/** All metrics for the top-level dashboard in a single call. Fast at our scale. */
export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  await requireRole(['ADMIN', 'STAFF']);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneWeekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAhead = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);
  const in30 = thirtyDaysAhead.toISOString().slice(0, 10);
  const in60 = sixtyDaysAhead.toISOString().slice(0, 10);

  // Batch queries in parallel — same DB roundtrip cost as a series of single COUNTs.
  const [
    candTotals,
    leadTotals,
    leadsLast7,
    employerTotals,
    reqTotals,
    reqFilled30,
    placementActive,
    placementNew30,
    paymentAwaiting,
    paymentVerified30,
    immOpen,
    immSubmitted,
    immExpiring,
    adActive,
    adExpiringSoon,
    adExpired,
    taskOpen,
    taskOverdue,
    taskThisWeek,
    positionsOpen,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        available: sql<number>`SUM(CASE WHEN ${candidateProfiles.availabilityStatus} = 'AVAILABLE' THEN 1 ELSE 0 END)::int`,
        placed: sql<number>`SUM(CASE WHEN ${candidateProfiles.availabilityStatus} = 'PLACED' THEN 1 ELSE 0 END)::int`,
        inactive: sql<number>`SUM(CASE WHEN ${candidateProfiles.lifecycleStatus} <> 'ACTIVE' THEN 1 ELSE 0 END)::int`,
      })
      .from(candidateProfiles)
      .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
      .where(
        and(
          eq(persons.isDraft, false),
          isNull(persons.mergedIntoPersonId),
          isNull(persons.archivedAt),
        ),
      )
      .then((r) => r[0] ?? { total: 0, available: 0, placed: 0, inactive: 0 }),
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        awaitingPayment: sql<number>`SUM(CASE WHEN ${leads.status} = 'AWAITING_PAYMENT' THEN 1 ELSE 0 END)::int`,
      })
      .from(leads)
      .where(and(isNull(leads.archivedAt), ne(leads.status, 'CONVERTED')))
      .then((r) => r[0] ?? { total: 0, awaitingPayment: 0 }),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(leads)
      .where(gt(leads.createdAt, sevenDaysAgo))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        active: sql<number>`SUM(CASE WHEN ${employers.relationshipStatus} = 'ACTIVE' THEN 1 ELSE 0 END)::int`,
      })
      .from(employers)
      .where(isNull(employers.archivedAt))
      .then((r) => r[0] ?? { total: 0, active: 0 }),
    db
      .select({
        open: sql<number>`SUM(CASE WHEN ${jobRequisitions.status} = 'OPEN' THEN 1 ELSE 0 END)::int`,
        inProgress: sql<number>`SUM(CASE WHEN ${jobRequisitions.status} IN ('IN_PROGRESS','PARTIALLY_FILLED') THEN 1 ELSE 0 END)::int`,
      })
      .from(jobRequisitions)
      .then((r) => r[0] ?? { open: 0, inProgress: 0 }),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobRequisitions)
      .where(
        and(eq(jobRequisitions.status, 'FILLED'), gt(jobRequisitions.updatedAt, thirtyDaysAgo)),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(placements)
      .where(sql`${placements.status} IN ('CONFIRMED','STARTED')`)
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(placements)
      .where(gt(placements.createdAt, thirtyDaysAgo))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(payments)
      .where(sql`${payments.status} IN ('PENDING','PROOF_UPLOADED')`)
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(payments)
      .where(and(eq(payments.status, 'VERIFIED'), gt(payments.verifiedAt, thirtyDaysAgo)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(and(isNull(immigrationCases.archivedAt), eq(immigrationCases.status, 'OPEN')))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(sql`${immigrationCases.status} IN ('SUBMITTED','UNDER_AUTHORITY_REVIEW')`)
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(
        and(
          isNull(immigrationCases.archivedAt),
          sql`${immigrationCases.expiresOn} BETWEEN ${today} AND ${in60}`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(advertisements)
      .where(eq(advertisements.status, 'ACTIVE'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(advertisements)
      .where(
        and(
          eq(advertisements.status, 'ACTIVE'),
          sql`${advertisements.expiryDate} BETWEEN ${today} AND ${in30}`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(advertisements)
      .where(sql`${advertisements.status} IN ('EXPIRED','CLOSED')`)
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(eq(tasks.status, 'OPEN'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(and(sql`${tasks.status} IN ('OPEN','IN_PROGRESS')`, lte(tasks.dueAt, now)))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        and(
          sql`${tasks.status} IN ('OPEN','IN_PROGRESS')`,
          between(tasks.dueAt, now, oneWeekAhead),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({
        n: sql<number>`COALESCE(SUM(${jobRequisitions.positionsRequired} - ${jobRequisitions.positionsFilled}), 0)::int`,
      })
      .from(jobRequisitions)
      .where(sql`${jobRequisitions.status} IN ('OPEN','IN_PROGRESS','PARTIALLY_FILLED')`)
      .then((r) => r[0]?.n ?? 0),
    // reference serviceEngagements so import isn't unused; may add stats later
  ]);
  void serviceEngagements;

  return {
    candidates: candTotals,
    leads: {
      total: leadTotals.total,
      awaitingPayment: leadTotals.awaitingPayment,
      lastSevenDays: leadsLast7,
    },
    employers: employerTotals,
    requisitions: {
      open: reqTotals.open,
      inProgress: reqTotals.inProgress,
      filledLast30Days: reqFilled30,
      totalPositionsOpen: positionsOpen,
    },
    placements: {
      activeConfirmed: placementActive,
      createdLast30Days: placementNew30,
    },
    payments: {
      awaitingVerification: paymentAwaiting,
      verifiedLast30Days: paymentVerified30,
    },
    immigration: {
      open: immOpen,
      submitted: immSubmitted,
      expiringWithin60Days: immExpiring,
    },
    ads: {
      active: adActive,
      expiringWithin30Days: adExpiringSoon,
      expired: adExpired,
    },
    tasks: {
      open: taskOpen,
      overdue: taskOverdue,
      dueThisWeek: taskThisWeek,
    },
  };
}
