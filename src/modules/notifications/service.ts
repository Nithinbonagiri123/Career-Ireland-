import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema/activities';
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

async function insertIfNew(row: typeof notifications.$inferInsert) {
  await db
    .insert(notifications)
    .values(row)
    .onConflictDoNothing({ target: notifications.dedupKey });
}

export async function runNotificationScan(): Promise<{ created: number }> {
  const todayIso = new Date().toISOString().slice(0, 10);
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

  // Overdue tasks (fire once per task per day)
  const now = new Date();
  const overdueTasks = await db
    .select()
    .from(tasks)
    .where(and(sql`${tasks.status} IN ('OPEN','IN_PROGRESS')`, lte(tasks.dueAt, now)));
  for (const t of overdueTasks) {
    if (!t.dueAt) continue;
    const dayStr = new Date().toISOString().slice(0, 10);
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
): Promise<Notification[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(notifications)
    .where(or(eq(notifications.recipientUserId, userId), isNull(notifications.recipientUserId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countMyUnread(userId: string): Promise<number> {
  await requireRole(['ADMIN', 'STAFF']);
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
  await requireRole(['ADMIN', 'STAFF']);
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
