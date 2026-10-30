import { config } from 'dotenv';
import { afterAll } from 'vitest';

config({ path: '.env.local' });

// R6 — each test file gets its own DB pool (module isolation); close it when
// the file finishes so pools do not pile up across a run. Files that mock
// the client (or never query) are unaffected: postgres-js connects lazily.
afterAll(async () => {
  const mod = (await import('@/lib/db/client').catch(() => null)) as {
    closeDb?: () => Promise<void>;
  } | null;
  await mod?.closeDb?.();
});
