import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fetchDatabaseIdentity, isManualDatabaseLabel, setupRunRefusal } from './manual-db-guard';

config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set');
}

// Decision 8 — migrating the manual-testing database is a deliberate,
// owner-approved act: it requires ALLOW_MANUAL_DB_MIGRATE=1, and that flag is
// refused on any other database. The URL is never printed.
{
  const refusal = setupRunRefusal('db:migrate', process.env.DATABASE_URL, process.env);
  if (refusal) {
    console.error(`✗ ${refusal}`);
    process.exit(2);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  // Live check: a database labelled for manual testing (COMMENT ON DATABASE)
  // but reached under another name still needs the explicit flag.
  const identity = await fetchDatabaseIdentity(url);
  if (
    identity &&
    isManualDatabaseLabel(identity.label) &&
    process.env.ALLOW_MANUAL_DB_MIGRATE !== '1'
  ) {
    console.error(
      `✗ db:migrate refuses to run: database "${identity.db}" is labelled for manual testing. Re-run with ALLOW_MANUAL_DB_MIGRATE=1 only if the owner approved this operation.`,
    );
    process.exit(2);
  }

  const client = postgres(url, { max: 1 });

  // Ensure required extensions exist before applying any migration.
  // citext gives us case-insensitive email uniqueness without app-side normalization.
  await client`CREATE EXTENSION IF NOT EXISTS citext`;

  await migrate(drizzle(client), { migrationsFolder: './src/lib/db/migrations' });
  await client.end();
  console.log('Migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
