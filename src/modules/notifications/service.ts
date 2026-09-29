import { and, desc, eq, inArray, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { todayInDublin } from '@/lib/dates';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
import { invoices } from '@/lib/db/schema/billing';
import { advertisements } from '@/lib/db/schema/campaigns';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { type Notification, notifications } from '@/lib/db/schema/notifications';

/**
 * Idempotent notification generator. Called by the daily cron.
 * Uses `dedupKey` to avoid re-firing the same alert (e.g. "ad X, 7d threshold").
 * Configurable thresholds live inline for now; move to system_settings later if needed.
 */
const AD_THRESHOLDS_DAYS = [30, 14, 7, 3, 1] as const;
const IMMIGRATION_EXPIRY_THRESHOLDS_DAYS = [60, 30, 14, 7] as const;
/**
 * Invoice aging buckets. Fires escalating notifications so a payment
 * that's a week overdue doesn't look identical to one that's two
 * months overdue on the dashboard. Aligned with the aging report's
 * OVERDUE_THRESHOLD_DAYS default (14) so the first notification lines
 * up with the moment the invoice starts showing OVERDUE in list UIs.
 */
const INVOICE_OVERDUE_THRESHOLDS_DAYS = [14, 30, 60, 90] as const;

async function insertIfNew(row: typeof notifications.$inferInsert) {
  await db
    .insert(notifications)
    .values(row)
    .onConflictDoNothing({ target: notifications.dedupKey });
}

export async function runNotificationScan(): Promise<{ created: number }> {
  // Dedup keys are per-Irish-day so a scan that spans UTC midnight doesn't
  // double-fire notifications (or skip them) for staff who use the Irish calendar.
  const todayIso = todayInDublin();
  let created = 0;

  // Advertisement expiring thresholds
  const activeAds = await db
    .select()
    .from(advertisements)
    .where(eq(advertisements.status, 'ACTIVE'));
  for (const ad of activeAds) {
    const daysLeft = Math.ceil(
      (new Date(ad.expiryDate).getTime() - new Date(todayIso).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft <= 0) continue;
    for (const threshold of AD_THRESHOLDS_DAYS) {
      if (daysLeft <= threshold) {
        const dedup = `ad-expiring:${ad.id}:${threshold}`;
        const before = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(eq(notifications.dedupKey, dedup))
          .limit(1);
        if (before.length === 0) {
          await insertIfNew({
            category: 'AD_EXPIRING',
            title: `Ad expiring in ${daysLeft}d`,
            body: `${ad.country} — ${ad.platform ?? 'platform'} — expires ${ad.expiryDate}`,
            entityType: 'advertisement',
            entityId: ad.id,
            href: `/campaigns/${ad.campaignId}`,
            dedupKey: dedup,
          });
          created += 1;
        }
        break; // Fire only the smallest matching threshold per run
      }
    }
  }

  // Immigration cases with expiring permits/visas
  const openCases = await db
    .select()
    .from(immigrationCases)
    .where(
      and(isNull(immigrationCases.archivedAt), sql`${immigrationCases.expiresOn} IS NOT NULL`),
    );
  for (const c of openCases) {
    if (!c.expiresOn) continue;
    const daysLeft = Math.ceil(
      (new Date(c.expiresOn).getTime() - new Date(todayIso).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysLeft <= 0) continue;
    for (const threshold of IMMIGRATION_EXPIRY_THRESHOLDS_DAYS) {
      if (daysLeft <= threshold) {
        const dedup = `imm-expiring:${c.id}:${threshold}`;
        const before = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(eq(notifications.dedupKey, dedup))
          .limit(1);
        if (before.length === 0) {
          await insertIfNew({
            category: 'IMMIGRATION_EXPIRING',
            title: `${c.caseType.replace(/_/g, ' ')} expires in ${daysLeft}d`,
            body: `Case ${c.authorityReference ?? c.id.slice(0, 8)} expires ${c.expiresOn}`,
            entityType: 'immigration_case',
            entityId: c.id,
            href: `/immigration`,
            dedupKey: dedup,
          });
          created += 1;
        }
        break;
      }
    }
  }

  // Overdue invoices — anything ISSUED or PARTIALLY_PAID beyond the
  // aging threshold fires an escalating alert (14 → 30 → 60 → 90 days).
  // Broadcast (no recipientUserId) so anyone on the finance dashboard
  // sees it. Dedup is per invoice + threshold so an invoice that
  // crosses 30d gets a new alert distinct from its 14d one, but the
  // 14d alert never re-fires.
  const openInvoices = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      totalAmount: invoices.totalAmount,
      currencyCode: invoices.currencyCode,
      issuedAt: invoices.issuedAt,
      status: invoices.status,
      payerPersonId: invoices.payerPersonId,
      payerEmployerId: invoices.payerEmployerId,
    })
    .from(invoices)
    .where(inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID']));
  for (const inv of openInvoices) {
    const daysOverdue = Math.floor(
      (Date.now() - new Date(inv.issuedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    // Fire the largest threshold this invoice has crossed. That way an
    // invoice that goes 6 months without payment shows the 90d alert
    // (not a stale 14d one) and never spams staff between escalations.
    let hit: number | null = null;
    for (const threshold of INVOICE_OVERDUE_THRESHOLDS_DAYS) {
      if (daysOverdue >= threshold) hit = threshold;
    }
    if (hit === null) continue;
    const dedup = `invoice-overdue:${inv.id}:${hit}`;
    const before = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.dedupKey, dedup))
      .limit(1);
    if (before.length > 0) continue;
    const href = inv.payerPersonId
      ? `/candidates/${inv.payerPersonId}/invoices/${inv.number}`
      : inv.payerEmployerId
        ? `/employers/${inv.payerEmployerId}/invoices/${inv.number}`
        : '/payments';
    await insertIfNew({
      category: 'INVOICE_OVERDUE',
      title: `${inv.number} is ${daysOverdue}d overdue`,
      body: `${inv.totalAmount} ${inv.currencyCode} · ${inv.status.replace(/_/g, ' ')} · issued ${new Date(
        inv.issuedAt,
      )
        .toISOString()
        .slice(0, 10)}`,
      entityType: 'invoice',
      entityId: inv.id,
      href,
      dedupKey: dedup,
    });
    created += 1;
  }

  // Overdue tasks (fire once per task per day)
  const now = new Date();
  const overdueTasks = await db
    .select()
    .from(tasks)
    .where(and(sql`${tasks.status} IN ('OPEN','IN_PROGRESS')`, lte(tasks.dueAt, now)));
  for (const t of overdueTasks) {
    if (!t.dueAt) continue;
    const dayStr = todayInDublin();
    const dedup = `task-overdue:${t.id}:${dayStr}`;
    await insertIfNew({
      recipientUserId: t.assignedUserId,
      category: 'TASK_OVERDUE',
      title: `Task overdue: ${t.title}`,
      body: `Was due ${t.dueAt.toISOString().slice(0, 10)} — assigned to you`,
      entityType: 'task',
      entityId: t.id,
      href: '/tasks',
      dedupKey: dedup,
    });
    created += 1;
  }

  return { created };
}

// --------- User-facing queries ---------

export async function fetchMyRecentNotifications(
  userId: string,
  limit = 50,
  createdRange?: DateRange,
): Promise<Notification[]> {
  await requireInternalStaff();
  const createdCond = createdRange
    ? dateRangeWhere(notifications.createdAt, createdRange)
    : undefined;
  const conds: SQL[] = [];
  const recipientCond = or(
    eq(notifications.recipientUserId, userId),
    isNull(notifications.recipientUserId),
  );
  if (recipientCond) conds.push(recipientCond);
  if (createdCond) conds.push(createdCond);
  return db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countMyUnread(userId: string): Promise<number> {
  await requireInternalStaff();
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(
      and(
        or(eq(notifications.recipientUserId, userId), isNull(notifications.recipientUserId)),
        isNull(notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  await requireInternalStaff();
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        or(eq(notifications.recipientUserId, userId), isNull(notifications.recipientUserId)),
        isNull(notifications.readAt),
      ),
    );
  return { updated: (result as unknown as { rowCount?: number }).rowCount ?? 0 };
}

/**
 * Dismiss a single notification for the calling user.
 * Fan-out notifications (recipientUserId IS NULL) are marked read only for
 * this user via a lightweight join to `notification_reads`? — for MVP we
 * simply update the row when it belongs to the caller. Fan-out rows can be
 * dismissed once (any user) — acceptable for the small-team scale.
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<{ updated: number }> {
  await requireInternalStaff();
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        or(eq(notifications.recipientUserId, userId), isNull(notifications.recipientUserId)),
        isNull(notifications.readAt),
      ),
    );
  return { updated: (result as unknown as { rowCount?: number }).rowCount ?? 0 };
}
