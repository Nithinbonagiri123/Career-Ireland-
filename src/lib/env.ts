import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  AWS_REGION: z.string().min(1),
  S3_BUCKET_DOCUMENTS: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  /** Custom S3 endpoint. Set for MinIO or other S3-compatible dev backends. */
  S3_ENDPOINT: z.string().url().optional(),
  /** MinIO needs path-style URLs (bucket in the path, not the subdomain). */
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  CRON_SECRET: z.string().optional(),
  /**
   * AES-256-GCM key for at-rest secrets (candidate email account passwords).
   * Base64-encoded 32 bytes. Required in production; optional in dev/test so
   * migrations and CI can boot without a real key.
   */
  EMAIL_CRED_ENC_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

export const env = parsed.data;

// Fail-fast validation for secrets that must be present in production at
// *runtime*. `next build` sets NODE_ENV=production while collecting page data,
// but the code paths that consume these secrets aren't reached — skipping this
// check during the build phase avoids forcing production secrets into CI. The
// production *server* (phase-production-server) still enforces it.
const nextPhase = process.env.NEXT_PHASE;
if (env.NODE_ENV === 'production' && nextPhase !== 'phase-production-build') {
  const missing: string[] = [];
  if (!env.CRON_SECRET) missing.push('CRON_SECRET');
  if (!env.EMAIL_CRED_ENC_KEY) missing.push('EMAIL_CRED_ENC_KEY');
  if (missing.length > 0) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }
  // Also validate EMAIL_CRED_ENC_KEY shape (32 bytes base64) so we fail at boot,
  // not at first candidate-email-account read.
  try {
    const key = Buffer.from(env.EMAIL_CRED_ENC_KEY ?? '', 'base64');
    if (key.length !== 32) {
      throw new Error(`EMAIL_CRED_ENC_KEY must decode to 32 bytes, got ${key.length}`);
    }
  } catch (err) {
    throw new Error(
      `EMAIL_CRED_ENC_KEY is malformed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
