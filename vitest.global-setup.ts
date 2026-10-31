import { config } from 'dotenv';
import {
  automatedRunRefusal,
  fetchDatabaseIdentity,
  liveIdentityRefusal,
} from './src/lib/db/manual-db-guard';

/**
 * Decision 8 — runs once per `vitest run`, before any worker starts.
 * Refuses the manual-testing database by URL name and, with one query, by
 * `current_database()` and its COMMENT label (catches a renamed / aliased
 * manual DB). If the DB is unreachable the live check is skipped; DB-backed
 * tests then fail on their own. The URL is never printed.
 */
export default async function setup(): Promise<void> {
  config({ path: '.env.local' });
  const url = process.env.DATABASE_URL;
  const byName = automatedRunRefusal('vitest', url);
  if (byName) throw new Error(byName);
  if (!url) return;
  const identity = await fetchDatabaseIdentity(url);
  const live = identity ? liveIdentityRefusal('vitest', identity) : null;
  if (live) throw new Error(live);
}
