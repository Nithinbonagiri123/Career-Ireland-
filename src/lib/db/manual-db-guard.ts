/**
 * Manual-testing database guard (Decision 8).
 *
 * The owner keeps hand-made test scenarios in a separate local database
 * (`ireland_careers_manual`) served on 127.0.0.1:3001. Automated tests and
 * seed scripts create, reset and delete rows, so they must never reach it.
 *
 * This module holds the shared rules. It has no imports so every runner can
 * load it: Vitest setup, Playwright config/global setup (no `@/` alias
 * there), tsx scripts and the migration runner.
 *
 * - A database is "manual" when its name is exactly `ireland_careers_manual`
 *   or ends in `_manual`, or (live check) its Postgres COMMENT starts with
 *   `icg:manual-testing`.
 * - Automated tests and test/destructive seeds: refused, no override.
 * - Migrations and idempotent reference seeds: refused unless the operator
 *   sets `ALLOW_MANUAL_DB_MIGRATE=1`. With the flag set, the target MUST be
 *   the manual DB — the flag is a statement of intent, not a bypass.
 *
 * Never print DATABASE_URL: it holds credentials. Messages here include the
 * database *name* only.
 */

export const MANUAL_DB_NAME = 'ireland_careers_manual';
export const MANUAL_DB_LABEL = 'icg:manual-testing';
export const MANUAL_SERVER_PORT = '3001';
export const MANUAL_DB_ALLOW_FLAG = 'ALLOW_MANUAL_DB_MIGRATE';

const MANUAL_NAME_SUFFIX = /_manual$/i;

/** The database-name segment of a postgres URL, or null if it can't be parsed. */
export function databaseNameFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const name = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return name || null;
  } catch {
    return null;
  }
}

export function isManualDatabaseName(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.trim();
  return n.toLowerCase() === MANUAL_DB_NAME || MANUAL_NAME_SUFFIX.test(n);
}

export function isManualDatabaseUrl(url: string | undefined | null): boolean {
  return isManualDatabaseName(databaseNameFromUrl(url));
}

/** True when a Postgres database COMMENT marks it as the manual-testing DB. */
export function isManualDatabaseLabel(label: string | undefined | null): boolean {
  return typeof label === 'string' && label.trim().startsWith(MANUAL_DB_LABEL);
}

/** True when a base URL targets the manual server's port (3001). */
export function isManualServerUrl(baseUrl: string | undefined | null): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).port === MANUAL_SERVER_PORT;
  } catch {
    return false;
  }
}

function flagSet(env: Record<string, string | undefined>): boolean {
  return env[MANUAL_DB_ALLOW_FLAG] === '1';
}

/**
 * Automated tests, E2E fixtures and test/destructive seeds. Returns a refusal
 * message when the URL targets the manual DB, else null. No override exists.
 */
export function automatedRunRefusal(
  context: string,
  url: string | undefined | null,
): string | null {
  if (!isManualDatabaseUrl(url)) return null;
  return `${context} refuses to run: DATABASE_URL targets the manual-testing database "${databaseNameFromUrl(url)}". Automated tests and test seeds may only use the dev or CI database. There is no override.`;
}

/**
 * Migrations and idempotent reference seeds. Manual DB requires
 * ALLOW_MANUAL_DB_MIGRATE=1; the flag on a non-manual DB is also refused so a
 * stray exported DATABASE_URL can't turn "set up manual" into "touch dev".
 */
export function setupRunRefusal(
  context: string,
  url: string | undefined | null,
  env: Record<string, string | undefined>,
): string | null {
  const manual = isManualDatabaseUrl(url);
  const allowed = flagSet(env);
  if (manual && !allowed) {
    return `${context} refuses to run: DATABASE_URL targets the manual-testing database "${databaseNameFromUrl(url)}". Re-run with ${MANUAL_DB_ALLOW_FLAG}=1 only if the owner approved this operation.`;
  }
  if (!manual && allowed) {
    return `${context} refuses to run: ${MANUAL_DB_ALLOW_FLAG}=1 is set but DATABASE_URL targets "${databaseNameFromUrl(url) ?? '(unparseable)'}", not the manual-testing database. Unset the flag for dev, or fix DATABASE_URL.`;
  }
  return null;
}

/** Playwright: refuse to drive the manual server. */
export function manualServerRefusal(
  context: string,
  baseUrl: string | undefined | null,
): string | null {
  if (!isManualServerUrl(baseUrl)) return null;
  return `${context} refuses to run: the Playwright base URL targets port ${MANUAL_SERVER_PORT}, the manual-testing server. E2E runs must use the dev server (:3000).`;
}

export type DatabaseIdentity = { db: string | null; label: string | null };

/** Live identity check result (pure — the query lives in the caller). */
export function liveIdentityRefusal(context: string, identity: DatabaseIdentity): string | null {
  if (isManualDatabaseName(identity.db) || isManualDatabaseLabel(identity.label)) {
    return `${context} refuses to run: the connected database "${identity.db ?? '?'}" is the manual-testing database (by name or COMMENT label).`;
  }
  return null;
}

/**
 * One round-trip identity query: `current_database()` plus its COMMENT.
 * Returns null when the DB can't be reached (the caller's own queries will
 * fail loudly anyway). Never logs the URL.
 */
export async function fetchDatabaseIdentity(url: string): Promise<DatabaseIdentity | null> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ db: string; label: string | null }[]>`
      select current_database() as db,
             shobj_description(d.oid, 'pg_database') as label
      from pg_database d
      where d.datname = current_database()`;
    const row = rows[0];
    return row ? { db: row.db, label: row.label } : null;
  } catch {
    return null;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

/** Scripts: print and exit(2) on refusal (same convention as _assert-local-db). */
export function exitOnRefusal(message: string | null): void {
  if (!message) return;
  console.error(`✗ ${message}`);
  process.exit(2);
}
