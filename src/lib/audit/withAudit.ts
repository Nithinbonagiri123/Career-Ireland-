import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { db } from '@/lib/db/client';
import { type AuditEvent, auditEvents } from '@/lib/db/schema/audit_events';

/**
 * Anything that behaves like a Drizzle query executor —
 * either the top-level `db` or an open transaction handle.
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction handle generic
export type DbExecutor = typeof db | PgTransaction<any, any, any>;

export type AuditContext = {
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown>;
  revertsEventId?: string;
};

/**
 * Write an audit event. **Always** pass the same executor you used for the domain mutation
 * (the transaction handle inside `db.transaction()`), so the domain change and its audit row
 * are atomic — either both commit or both roll back.
 *
 * Never write to `audit_events` directly. Always go through this function.
 */
export async function recordAudit(tx: DbExecutor, ctx: AuditContext): Promise<AuditEvent> {
  const [row] = await tx
    .insert(auditEvents)
    .values({
      actorUserId: ctx.actorUserId,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      action: ctx.action,
      before: ctx.before ?? null,
      after: ctx.after ?? null,
      context: ctx.context ?? null,
      revertsEventId: ctx.revertsEventId,
    })
    .returning();
  if (!row) throw new Error('audit_events insert returned no row');
  return row;
}

/**
 * Record a revert. Creates a NEW audit event linking to the reverted one via `revertsEventId`.
 * The original event is never modified. Caller must also perform the inverse domain mutation
 * inside the same transaction.
 */
export async function recordRevert(
  tx: DbExecutor,
  args: {
    actorUserId: string;
    revertedEvent: Pick<AuditEvent, 'id' | 'entityType' | 'entityId' | 'before' | 'after'>;
    reason: string;
  },
): Promise<AuditEvent> {
  return recordAudit(tx, {
    actorUserId: args.actorUserId,
    entityType: args.revertedEvent.entityType,
    entityId: args.revertedEvent.entityId,
    action: 'REVERTED',
    before: args.revertedEvent.after,
    after: args.revertedEvent.before,
    context: { reason: args.reason },
    revertsEventId: args.revertedEvent.id,
  });
}
