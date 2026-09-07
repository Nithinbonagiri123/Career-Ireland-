import { desc, eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { users } from '@/lib/db/schema/users';

/**
 * Recent activity for the operational dashboard — a live-feeling feed
 * of "what just happened." Backed directly by `audit_events` so the
 * feed can never lie or drift from what the system actually did. Only
 * business-relevant actions are surfaced; noise like SESSION_REFRESHED
 * or REQUIREMENTS_MATERIALIZED is filtered out at query time.
 */

export type ActivityRow = {
  id: string;
  occurredAt: Date;
  actorName: string | null;
  entityType: string;
  entityId: string;
  action: string;
};

/** Audit actions worth showing in the operational feed. Everything else is background housekeeping. */
const NOISY_ACTIONS = new Set([
  'REQUIREMENTS_MATERIALIZED',
  'MATCHING_RUN',
  'DOCUMENT_ATTACHED',
  'DOCUMENT_DETACHED',
  'SKILL_ATTACHED',
  'SKILL_DETACHED',
  'QUALIFICATION_ATTACHED',
  'QUALIFICATION_DETACHED',
]);

export async function fetchRecentActivity(limit = 12): Promise<ActivityRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  // Pull a wider slice than we intend to show so the client filter can
  // still return `limit` rows after dropping noisy actions.
  const rows = await db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      actorName: users.fullName,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      action: auditEvents.action,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit * 3);

  return rows.filter((r) => !NOISY_ACTIONS.has(r.action)).slice(0, limit);
}
