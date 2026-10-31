/**
 * Guard for test seeders and admin repair scripts: refuse to run unless
 * DATABASE_URL points at a database on this machine (local dev or the CI
 * job's own Postgres service container, which is also `localhost`).
 *
 * These scripts reset passwords, create test owners or wipe data. Pointed
 * at a shared or production database they would do real damage, so there
 * is deliberately no override flag. The URL itself is never printed.
 *
 * They also refuse the manual-testing database (Decision 8), with no
 * override: those rows belong to the owner's hand-made scenarios.
 *
 * Call it after dotenv has loaded and before importing the db client.
 */
import { automatedRunRefusal, exitOnRefusal, setupRunRefusal } from '../src/lib/db/manual-db-guard';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function assertLocalDatabase(scriptName: string): void {
  if (!process.env.DATABASE_URL) {
    console.error(`✗ ${scriptName}: DATABASE_URL is not set.`);
    process.exit(2);
  }
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    console.error(
      `✗ ${scriptName} refuses to run: DATABASE_URL does not point at a local database (localhost / 127.0.0.1 / ::1). This script is for local and CI databases only.`,
    );
    process.exit(2);
  }
  exitOnRefusal(automatedRunRefusal(scriptName, process.env.DATABASE_URL));
}

/**
 * Guard for idempotent reference seeds, the first-admin seed and data
 * repair scripts (Decision 8). Dev / CI databases: unchanged. The
 * manual-testing database: only with ALLOW_MANUAL_DB_MIGRATE=1, and that flag
 * is refused on any other database. Call after dotenv has loaded.
 */
export function assertSetupTarget(scriptName: string): void {
  exitOnRefusal(setupRunRefusal(scriptName, process.env.DATABASE_URL, process.env));
}

/**
 * Read a required test-only secret from the environment. Values are never
 * committed to source; locally they live in .env.local, in CI they are
 * generated fresh per run.
 */
export function requireTestSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 12) {
    console.error(
      `✗ ${name} is not set (or shorter than 12 characters). Add it to .env.local for local runs; CI generates it per run.`,
    );
    process.exit(2);
  }
  return value;
}
