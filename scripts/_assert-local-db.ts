/**
 * Guard for test seeders and admin repair scripts: refuse to run unless
 * DATABASE_URL points at a database on this machine (local dev or the CI
 * job's own Postgres service container, which is also `localhost`).
 *
 * These scripts reset passwords, create test owners or wipe data. Pointed
 * at a shared or production database they would do real damage, so there
 * is deliberately no override flag. The URL itself is never printed.
 *
 * Call it after dotenv has loaded and before importing the db client.
 */
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
