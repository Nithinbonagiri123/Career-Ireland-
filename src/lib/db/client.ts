import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

/**
 * One postgres pool per process.
 *
 * Production: unchanged — a fresh pool of 10 connections, no idle timeout.
 *
 * Development (R6): `next dev` re-evaluates this module on every hot
 * reload. Without caching, each reload opened a new pool and never closed
 * the old one, until Postgres refused connections ("too many clients").
 * The pool is now kept on globalThis and reused across reloads, and idle
 * connections are released after 20 s.
 *
 * Test (vitest / Playwright workers): a per-process pool that releases idle
 * connections after 10 s; `closeDb()` ends it from test teardown.
 */
type Pg = ReturnType<typeof postgres>;
const globalForDb = globalThis as unknown as { __icgDevPg?: Pg };

function createClient(): Pg {
  if (env.NODE_ENV === 'production') {
    return postgres(env.DATABASE_URL, { max: 10, prepare: false });
  }
  return postgres(env.DATABASE_URL, {
    max: 3,
    prepare: false,
    idle_timeout: env.NODE_ENV === 'development' ? 20 : 10,
  });
}

function getClient(): Pg {
  if (env.NODE_ENV !== 'development') return createClient();
  if (!globalForDb.__icgDevPg) globalForDb.__icgDevPg = createClient();
  return globalForDb.__icgDevPg;
}

const client: Pg = getClient();

// Query logger is opt-in via DB_LOG=1 — on every page view the ORM
// emits dozens of lines, which drowns the actual Next.js dev output
// (route compiles, server-action results, errors). When debugging a
// specific flow, run `DB_LOG=1 pnpm dev` to turn it back on.
export const db = drizzle(client, { schema, logger: process.env.DB_LOG === '1' });
export type Db = typeof db;

/** Close this process's pool (test teardown only — never called by the app). */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
