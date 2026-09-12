import {
  type AnyPgColumn,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Fine-grained user permissions.
 *
 * One row per (user, business, module, verb). Absence = denied. Owner
 * (users.is_owner = true) bypasses the check entirely.
 *
 * `business`, `module`, `verb` are free-form text on purpose — the
 * source of truth for allowed values lives in
 * `src/lib/auth/permissions.ts` (const arrays with TS types). Keeping
 * them out of the DB enum means adding a module is a code-only change
 * with no migration required, at the cost of the DB not rejecting
 * unknown strings. The service-layer helpers do that check.
 *
 * Verbs cascade at read time: a `manage` grant satisfies checks for
 * `delete`, `edit`, `create`, and `view` — see `hasPermission`. This
 * is why we don't need to store the implied grants explicitly.
 */
export const userPermissions = pgTable(
  'user_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    business: text('business').notNull(),
    module: text('module').notNull(),
    verb: text('verb').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid('granted_by_user_id').references((): AnyPgColumn => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.business, t.module, t.verb] }),
    index('user_permissions_user_idx').on(t.userId),
  ],
);

export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;
