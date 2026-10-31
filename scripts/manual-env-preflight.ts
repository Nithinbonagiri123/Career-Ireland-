/**
 * Preflight for `pnpm dev:manual` (Decision 8 — isolated manual-testing
 * environment). Runs with `tsx --env-file=.env.manual.local`, so the manual
 * env file's values are in process.env before anything else.
 *
 * Refuses to start the manual server unless:
 *   1. DATABASE_URL names the manual-testing database, and the live
 *      `current_database()` agrees;
 *   2. AUTH_URL is http://127.0.0.1:3001 (127.0.0.1, not localhost, so the
 *      browser keeps a separate cookie jar from the dev server on localhost);
 *   3. AUTH_SECRET is set (32+ chars) and is NOT the dev server's secret, so
 *      a session from one server is never accepted by the other;
 *   4. 127.0.0.1:3001 is free, so Next never falls back to another port.
 *
 * Nothing secret is printed — only pass/fail lines and the database name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { parse } from 'dotenv';
import {
  databaseNameFromUrl,
  fetchDatabaseIdentity,
  isManualDatabaseName,
  isManualDatabaseUrl,
  MANUAL_SERVER_PORT,
} from '../src/lib/db/manual-db-guard';

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

function portIsFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail('DATABASE_URL is not set — is .env.manual.local present in this checkout?');
  } else if (!isManualDatabaseUrl(url)) {
    fail(
      `DATABASE_URL targets "${databaseNameFromUrl(url) ?? '(unparseable)'}", not the manual-testing database. (A DATABASE_URL exported in your shell wins over the env file — open a fresh shell.)`,
    );
  }

  let authUrlOk = false;
  try {
    const u = new URL(process.env.AUTH_URL ?? '');
    authUrlOk = u.hostname === '127.0.0.1' && u.port === MANUAL_SERVER_PORT;
  } catch {
    authUrlOk = false;
  }
  if (!authUrlOk) fail(`AUTH_URL must be http://127.0.0.1:${MANUAL_SERVER_PORT}.`);

  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 32) {
    fail('AUTH_SECRET must be set to a NEW random value of 32+ characters.');
  } else {
    // Compare (never print) against the dev env file, if this checkout has one.
    const devEnv = path.join(process.cwd(), '.env.local');
    if (existsSync(devEnv)) {
      const devSecret = parse(readFileSync(devEnv)).AUTH_SECRET;
      if (devSecret && devSecret === secret) {
        fail('AUTH_SECRET is the same as the dev server secret — generate a new one.');
      }
    }
  }

  if (!(await portIsFree(Number(MANUAL_SERVER_PORT), '127.0.0.1'))) {
    fail(
      `127.0.0.1:${MANUAL_SERVER_PORT} is already in use — stop whatever is listening there first.`,
    );
  }

  if (url && isManualDatabaseUrl(url)) {
    const identity = await fetchDatabaseIdentity(url);
    if (!identity) {
      fail(
        'Could not connect to the manual-testing database (does it exist? see docs/manual-test-database-plan.md).',
      );
    } else if (!isManualDatabaseName(identity.db)) {
      fail(`Connected database is "${identity.db}", not the manual-testing database.`);
    }
  }

  if (failures.length > 0) {
    console.error('✗ dev:manual preflight failed:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(2);
  }
  console.log(
    `✓ dev:manual preflight: database "${databaseNameFromUrl(url)}", server http://127.0.0.1:${MANUAL_SERVER_PORT}, distinct AUTH_SECRET.`,
  );
}

main().catch((e: unknown) => {
  console.error(`✗ dev:manual preflight crashed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
