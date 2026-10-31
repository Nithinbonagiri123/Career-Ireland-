import { config } from 'dotenv';
import { afterAll } from 'vitest';
import { automatedRunRefusal } from './src/lib/db/manual-db-guard';

config({ path: '.env.local' });

// Decision 8 — DB-backed tests must never touch the manual-testing database.
// Synchronous name check (no DB round-trip), before any test file imports the
// client. The live `current_database()` / COMMENT check runs once per run in
// vitest.global-setup.ts. The URL is never printed.
{
  const refusal = automatedRunRefusal('vitest', process.env.DATABASE_URL);
  if (refusal) throw new Error(refusal);
}

// R6 — each test file gets its own DB pool (module isolation); close it when
// the file finishes so pools do not pile up across a run. Files that mock
// the client (or never query) are unaffected: postgres-js connects lazily.
afterAll(async () => {
  const mod = (await import('@/lib/db/client').catch(() => null)) as {
    closeDb?: () => Promise<void>;
  } | null;
  await mod?.closeDb?.();
});
