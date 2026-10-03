/**
 * One-off env shim for standalone CLI scripts (seed, repair, backfill).
 *
 * The runtime env validator in src/lib/env.ts demands AUTH_SECRET,
 * AUTH_URL, AWS_REGION and S3_BUCKET_DOCUMENTS so the Next.js server
 * refuses to boot without real values. These scripts only talk to
 * Postgres via drizzle; none of those services are reached, so the
 * validator failure is pure noise.
 *
 * This module sets *placeholder* values for the demanded keys **only
 * if they are not already set**. Real values in .env.local or the
 * shell environment win via `??=`. Import this at the top of a script
 * before any `@/lib/*` import so the validator passes.
 */

process.env.AUTH_SECRET ??= '0'.repeat(32);
process.env.AUTH_URL ??= 'http://localhost';
process.env.AWS_REGION ??= 'eu-west-1';
process.env.S3_BUCKET_DOCUMENTS ??= 'placeholder';
