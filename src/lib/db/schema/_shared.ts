import { customType, timestamp } from 'drizzle-orm/pg-core';

/** Postgres citext type — case-insensitive text. Requires citext extension. */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
