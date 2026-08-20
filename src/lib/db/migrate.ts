import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
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
