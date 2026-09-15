import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { type AuditEvent, auditEvents } from '@/lib/db/schema/audit_events';
import { users } from '@/lib/db/schema/users';
import type { AuditListQuery } from './schemas';

export type AuditEventWithActor = AuditEvent & {
  actorEmail: string | null;
  actorName: string | null;
};

export async function listAuditEvents(
  query: AuditListQuery,
): Promise<{ items: AuditEventWithActor[]; nextCursor: AuditListQuery['cursor'] | null }> {
  const filters = [
    query.entityType ? eq(auditEvents.entityType, query.entityType) : undefined,
    query.actorUserId ? eq(auditEvents.actorUserId, query.actorUserId) : undefined,
    query.action ? eq(auditEvents.action, query.action) : undefined,
    query.from ? gte(auditEvents.occurredAt, new Date(query.from)) : undefined,
    query.to ? lt(auditEvents.occurredAt, new Date(query.to)) : undefined,
    query.cursor
      ? or(
          lt(auditEvents.occurredAt, new Date(query.cursor.occurredAt)),
          and(
            eq(auditEvents.occurredAt, new Date(query.cursor.occurredAt)),
            lt(auditEvents.id, query.cursor.id),
          ),
        )
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      actorUserId: auditEvents.actorUserId,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      action: auditEvents.action,
      before: auditEvents.before,
      after: auditEvents.after,
      context: auditEvents.context,
      revertsEventId: auditEvents.revertsEventId,
      actorEmail: users.email,
      actorName: users.fullName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(filters.length ? and(...filters) : sql`true`)
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(query.limit + 1);

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last ? { occurredAt: last.occurredAt.toISOString(), id: last.id } : null;

  return { items, nextCursor };
}

export async function listDistinctEntityTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ entityType: auditEvents.entityType })
    .from(auditEvents)
    .orderBy(auditEvents.entityType);
  return rows.map((r) => r.entityType);
}

export async function listDistinctActions(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: auditEvents.action })
    .from(auditEvents)
    .orderBy(auditEvents.action);
  return rows.map((r) => r.action);
}

/**
 * Users who have EVER been the actor on an audit event. Used to
 * populate the "actor" filter dropdown on the audit page. Left-join
 * pattern so we can filter out the system rows (actorUserId = null)
 * cleanly.
 */
export async function listDistinctActors(): Promise<
  Array<{ id: string; email: string; fullName: string }>
> {
  const rows = await db
    .selectDistinct({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
    })
    .from(auditEvents)
    .innerJoin(users, eq(users.id, auditEvents.actorUserId))
    .orderBy(users.fullName);
  return rows;
}
