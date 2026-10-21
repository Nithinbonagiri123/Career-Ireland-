/**
 * Staging DB guard (release-prep requirement 4, strengthened per owner
 * review) — the bootstrap may only run against an EXPLICITLY APPROVED
 * database identity, never a heuristic guess.
 *
 * Identity handshake (all owner-provided, none secret):
 *   - `STAGING_DB_EXPECTED_HOST` — the approved hostname; the URL's host
 *     must match EXACTLY.
 *   - `STAGING_DB_EXPECTED_NAME` — the approved database name; checked
 *     against the URL's path AND against `current_database()` on the
 *     live connection, so an alias or parsing quirk can't slip past.
 *   - `STAGING_DB_EXPECTED_ENDPOINT_ID` (optional, Neon-style) — the
 *     compute/branch endpoint id (e.g. `ep-cool-sky-a1b2c3`); when set,
 *     the host's first label must equal it, pinning the exact Neon
 *     project/branch endpoint rather than any database that shares a
 *     domain suffix.
 *   - On first bootstrap the approved host + database name are written
 *     into the `__staging_marker` table; every re-run verifies the
 *     marker's stored identity against the live connection, so the
 *     marker can't be satisfied by a different database that merely has
 *     the same table.
 *
 * Every check runs BEFORE any migration or seed write — the bootstrap
 * invokes this probe first and aborts on any non-zero exit.
 *
 * The previous live-data tripwire (invoices/receipts/person counts) is
 * KEPT as defence-in-depth, but it is no longer the deciding mechanism.
 *
 * Exit codes: 0 = safe to proceed, 2 = blocked. Standalone on purpose —
 * no app imports, no .env.local, only the explicitly provided URL.
 */
import postgres from 'postgres';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function dbNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')).toLowerCase();
  } catch {
    return '';
  }
}

async function main() {
  const url = process.env.STAGING_DATABASE_URL;
  const expectedHost = (process.env.STAGING_DB_EXPECTED_HOST ?? '').trim().toLowerCase();
  const expectedName = (process.env.STAGING_DB_EXPECTED_NAME ?? '').trim().toLowerCase();
  const expectedEndpoint = (process.env.STAGING_DB_EXPECTED_ENDPOINT_ID ?? '').trim().toLowerCase();
  if (!url) {
    console.error('✗ STAGING_DATABASE_URL is not set. Refusing to guess a database.');
    process.exit(2);
  }
  if (!expectedHost || !expectedName) {
    console.error(
      '✗ STAGING_DB_EXPECTED_HOST and STAGING_DB_EXPECTED_NAME must both be set. The owner must ' +
        'name the approved staging DB host AND database name — identity approval is required, heuristics are not enough.',
    );
    process.exit(2);
  }
  const host = hostOf(url);
  const dbName = dbNameOf(url);
  if (!host || !dbName) {
    console.error('✗ STAGING_DATABASE_URL is not a parseable URL with a database path.');
    process.exit(2);
  }
  if (host !== expectedHost) {
    console.error(
      `✗ BLOCKED: connected host "${host}" does not match the approved staging host ` +
        `"${expectedHost}". Refusing to touch an unapproved database.`,
    );
    process.exit(2);
  }
  if (dbName !== expectedName) {
    console.error(
      `✗ BLOCKED: URL database name "${dbName}" does not match the approved name ` +
        `"${expectedName}".`,
    );
    process.exit(2);
  }
  if (expectedEndpoint) {
    const firstLabel = host.split('.')[0] ?? '';
    if (firstLabel !== expectedEndpoint) {
      console.error(
        `✗ BLOCKED: host endpoint "${firstLabel}" does not match the approved endpoint id ` +
          `"${expectedEndpoint}" (Neon project/branch identity).`,
      );
      process.exit(2);
    }
  }
  if (process.env.PROD_DATABASE_URL && url === process.env.PROD_DATABASE_URL) {
    console.error('✗ STAGING_DATABASE_URL equals PROD_DATABASE_URL. Absolutely not.');
    process.exit(2);
  }
  if (process.env.PROD_DATABASE_URL && hostOf(process.env.PROD_DATABASE_URL) === host) {
    console.error('✗ BLOCKED: the staging host equals the production host.');
    process.exit(2);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== url) {
    if (hostOf(process.env.DATABASE_URL) === host) {
      console.error(
        '✗ BLOCKED: the staging host equals the ambient DATABASE_URL host (your dev database). ' +
          'Point STAGING_DB at the dedicated staging instance.',
      );
      process.exit(2);
    }
  }

  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    // Server-side identity: what the connection actually landed on, not
    // what the URL claims. Catches aliases, pgbouncer rewrites, typos.
    const [ident] = await sql`SELECT current_database() AS db`;
    const liveDb = String(ident?.db ?? '').toLowerCase();
    if (liveDb !== expectedName) {
      console.error(
        `✗ BLOCKED: current_database() is "${liveDb}" but the approved name is "${expectedName}".`,
      );
      process.exit(2);
    }
    const [marker] = await sql`
      SELECT to_regclass('public.__staging_marker') IS NOT NULL AS present
    `;
    if (marker?.present) {
      const [row] = await sql`
        SELECT expected_host, expected_db FROM __staging_marker ORDER BY created_at ASC LIMIT 1
      `;
      const storedHost = String(row?.expected_host ?? '').toLowerCase();
      const storedDb = String(row?.expected_db ?? '').toLowerCase();
      if (storedHost !== host || storedDb !== liveDb) {
        console.error(
          `✗ BLOCKED: __staging_marker says this database was bootstrapped as ` +
            `"${storedDb}" at "${storedHost}" but we are connected to "${liveDb}" at "${host}". Identity mismatch.`,
        );
        process.exit(2);
      }
      console.log(
        `✓ __staging_marker identity verified (${liveDb} @ ${host}) — recognised staging DB.`,
      );
      return;
    }

    // First bootstrap: identity approved via STAGING_DB_EXPECTED_HOST above.
    // Keep the live-data tripwire as defence-in-depth.
    const [tables] = await sql`
      SELECT to_regclass('public.persons')  IS NOT NULL AS has_persons
    `;
    if (!tables?.has_persons) {
      console.log(`✓ Fresh/empty database at approved host ${host} — safe for first bootstrap.`);
      return;
    }
    const [counts] = await sql`
      SELECT (SELECT COUNT(*) FROM persons)::int AS persons,
             (CASE WHEN to_regclass('public.invoices') IS NOT NULL
                   THEN (SELECT COUNT(*) FROM invoices) ELSE 0 END)::int AS invoices,
             (CASE WHEN to_regclass('public.receipts') IS NOT NULL
                   THEN (SELECT COUNT(*) FROM receipts) ELSE 0 END)::int AS receipts
    `;
    const { persons = 0, invoices = 0, receipts = 0 } = counts ?? {};
    if (invoices > 0 || receipts > 0 || persons > 25) {
      console.error(
        `✗ BLOCKED: approved-host database already holds live-looking data (${persons} persons, ` +
          `${invoices} invoices, ${receipts} receipts) without a __staging_marker. ` +
          'Stop and check how this database was created.',
      );
      process.exit(2);
    }
    console.log(
      `✓ Near-empty database at approved host ${host} (${persons} persons, 0 invoices/receipts) — safe to bootstrap.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('✗ Guard probe failed:', err instanceof Error ? err.message : err);
  process.exit(2);
});
