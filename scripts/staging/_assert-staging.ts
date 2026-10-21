/**
 * Import-time guard for every staging script: DATABASE_URL must have been
 * exported by the bootstrap orchestrator from STAGING_DATABASE_URL (they
 * must match exactly), and the usual service-env placeholders are filled
 * so src/lib/env.ts validates. This makes it impossible to run a staging
 * seed against .env.local's database — or anything else — by accident.
 */
if (!process.env.STAGING_DATABASE_URL) {
  console.error('✗ STAGING_DATABASE_URL is not set — run via scripts/staging/bootstrap-staging.sh');
  process.exit(2);
}
if (process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) {
  console.error(
    '✗ DATABASE_URL does not match STAGING_DATABASE_URL — run via scripts/staging/bootstrap-staging.sh',
  );
  process.exit(2);
}
process.env.AUTH_SECRET ??= 'staging-script-placeholder-secret-32-chars-min';
process.env.AUTH_URL ??= 'http://localhost:3000';
process.env.AWS_REGION ??= 'eu-west-1';
process.env.S3_BUCKET_DOCUMENTS ??= 'staging-script-placeholder';

export {};
