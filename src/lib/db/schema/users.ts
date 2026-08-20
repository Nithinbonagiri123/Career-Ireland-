import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { citext, createdAt, updatedAt } from './_shared';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    role: text('role', { enum: ['ADMIN', 'STAFF'] })
      .notNull()
      .default('STAFF'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [check('users_role_check', sql`${t.role} IN ('ADMIN','STAFF')`)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = User['role'];
