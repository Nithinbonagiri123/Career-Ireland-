/**
 * One-off env shim for standalone CLI scripts (seed, repair, backfill).
 *
 * The runtime env validator in src/lib/env.ts demands AUTH_SECRET,
 * AUTH_URL, AWS_REGION, S3_BUCKET_DOCUMENTS, and DATABASE_URL so the
 * Next.js server refuses to boot without real values. These scripts
 * only talk to Postgres via drizzle; the service keys are pure noise.
 *
 * This module:
 *   1. Loads .env.local so DATABASE_URL and any real overrides are
 *      present at module-load time (CommonJS require executes this
 *      file BEFORE the sibling `import { db } from '@/lib/db/client'`
 *      runs env.ts, so this is early enough).
 *   2. Fills *placeholders* for the service keys only if they are not
 *      already set — real values from .env.local or the shell always
 *      win via `??=`.
 *
 * Import this at the top of a script before any `@/lib/*` import so
 * the validator passes.
 */

import { config } from 'dotenv';

// First tries .env.local (the project's dev file). Also loads .env
// as a fallback in case someone is running in a different environment.
config({ path: '.env.local' });
config();

process.env.AUTH_SECRET ??= '0'.repeat(32);
process.env.AUTH_URL ??= 'http://localhost';
process.env.AWS_REGION ??= 'eu-west-1';
process.env.S3_BUCKET_DOCUMENTS ??= 'placeholder';
