import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { recordAudit } from '@/lib/audit/withAudit';
import { tasks } from '@/lib/db/schema/activities';

/**
 * User-picked follow-up on an advertisement. Fires on the reminder_on date itself.
 * Kept as a constant so `ensureAdReminderTask` / `cancelAdReminderTask` idempotency
 * (via the partial unique index on (advertisement_id, title)) works consistently.
 */
const AD_REMINDER_TITLE = 'Reminder: follow up on advert';
const AD_REMINDER_DESCRIPTION =
  'Reminder date reached on this advertisement. Check performance / applicant count and act accordingly.';
const AD_REMINDER_PRIORITY = 'NORMAL' as const;

/**
 * Ensure a reminder task exists on the advertisement due at `reminderOn`. Idempotent
 * via the partial unique index `tasks_advertisement_title_active_uidx`. If the reminder
 * date moved, callers must cancel the existing task first via {@link cancelAdReminderTask}.
 */
export async function ensureAdReminderTask(
  tx: DbExecutor,
  args: {
    advertisementId: string;
    reminderOn: string;
    actorUserId: string;
  },
): Promise<{ created: boolean }> {
  const dueAt = new Date(args.reminderOn);
  if (Number.isNaN(dueAt.getTime())) return { created: false };
  const now = new Date();
  if (dueAt < now) dueAt.setTime(now.getTime());

  const [existing] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.advertisementId, args.advertisementId),
        eq(tasks.title, AD_REMINDER_TITLE),
        inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
      ),
    )
    .limit(1);
  if (existing) return { created: false };

  const inserted = await tx
    .insert(tasks)
    .values({
      title: AD_REMINDER_TITLE,
      description: AD_REMINDER_DESCRIPTION,
      dueAt,
      priority: AD_REMINDER_PRIORITY,
      status: 'OPEN',
      advertisementId: args.advertisementId,
      assignedUserId: args.actorUserId,
    })
    .onConflictDoNothing()
    .returning();
  const row = inserted[0];
  if (!row) return { created: false };

  await recordAudit(tx, {
    actorUserId: args.actorUserId,
    entityType: 'task',
    entityId: row.id,
    action: 'CREATED',
    after: {
      title: row.title,
      advertisementId: args.advertisementId,
      dueAt: row.dueAt,
      priority: row.priority,
    },
    context: { via: 'auto:campaigns', trigger: 'ad_reminder', reminderOn: args.reminderOn },
  });
  return { created: true };
}

/** Cancel any open ad-reminder task on this advertisement. */
export async function cancelAdReminderTask(
  tx: DbExecutor,
  args: { advertisementId: string; actorUserId: string },
): Promise<{ cancelled: number }> {
  const rows = await tx
    .update(tasks)
    .set({ status: 'CANCELLED', completedAt: new Date() })
    .where(
      and(
        eq(tasks.advertisementId, args.advertisementId),
        eq(tasks.title, AD_REMINDER_TITLE),
        inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
      ),
    )
    .returning({ id: tasks.id });
  for (const row of rows) {
    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'task',
      entityId: row.id,
      action: 'STATUS_CHANGED',
      after: { status: 'CANCELLED' },
      context: { via: 'auto:campaigns', trigger: 'ad_reminder_cleared' },
    });
  }
  return { cancelled: rows.length };
}
