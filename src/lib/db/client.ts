import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'production' ? 10 : 3,
  prepare: false,
});

// Query logger is opt-in via DB_LOG=1 — on every page view the ORM
// emits dozens of lines, which drowns the actual Next.js dev output
// (route compiles, server-action results, errors). When debugging a
// specific flow, run `DB_LOG=1 pnpm dev` to turn it back on.
export const db = drizzle(client, { schema, logger: process.env.DB_LOG === '1' });
export type Db = typeof db;
