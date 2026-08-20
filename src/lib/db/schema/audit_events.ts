import {
  type AnyPgColumn,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Append-only audit log for business-critical mutations.
 * Written INSIDE the same Drizzle transaction as the domain change
 * via `recordAudit()` in `src/lib/audit/withAudit.ts`.
 * Never UPDATE. Never DELETE. Reverts create a NEW event referencing the reverted one.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    context: jsonb('context'),
    revertsEventId: uuid('reverts_event_id').references((): AnyPgColumn => auditEvents.id),
  },
  (t) => [
    index('audit_events_entity_idx').on(t.entityType, t.entityId, t.occurredAt.desc()),
    index('audit_events_actor_idx').on(t.actorUserId, t.occurredAt.desc()),
    index('audit_events_occurred_idx').on(t.occurredAt.desc()),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
