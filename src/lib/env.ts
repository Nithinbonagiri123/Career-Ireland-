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
  /**
   * Transactional mail delivery. `console` (default) logs the message to stdout
   * — perfect for local dev + CI, useless for real users. `resend` uses
   * https://resend.com and requires RESEND_API_KEY. Production must not run
   * on `console`.
   */
  MAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  /** Sender address, e.g. `Ireland Career Gateway <no-reply@yourdomain.ie>`. Required in production. */
  MAIL_FROM: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Sentry DSN. Optional — Sentry init is a no-op when unset, so dev/CI don't
   * need a project. In production, leaving this empty just means errors won't
   * be captured (they still log via pino); set it once the Sentry project
   * exists.
   */
  SENTRY_DSN: z.string().url().optional(),
  /** Public DSN exposed to the browser build. Usually the same value as SENTRY_DSN. */
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
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
  if (!env.MAIL_FROM) missing.push('MAIL_FROM');
  if (env.MAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (missing.length > 0) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }
  // Refuse to run the console mailer in production — silently swallowing
  // password-reset emails would lock every user out of their account.
  if (env.MAIL_PROVIDER === 'console') {
    throw new Error(
      'MAIL_PROVIDER=console is not allowed in production. Set MAIL_PROVIDER=resend + RESEND_API_KEY.',
    );
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

  // Refuse to boot if the S3 endpoint is a local/dev URL — this almost always
  // means a `.env.local` MinIO block leaked into a production deploy. Real
  // AWS/R2/etc. never point at localhost or private-network hosts.
  if (env.S3_ENDPOINT) {
    let host = '';
    try {
      host = new URL(env.S3_ENDPOINT).hostname.toLowerCase();
    } catch {
      throw new Error(`S3_ENDPOINT is not a valid URL: ${env.S3_ENDPOINT}`);
    }
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isPrivate =
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal');
    if (isLoopback || isPrivate) {
      throw new Error(
        `S3_ENDPOINT=${env.S3_ENDPOINT} looks like a dev backend (loopback / private network). Remove S3_ENDPOINT + S3_FORCE_PATH_STYLE from production env and use real AWS credentials instead.`,
      );
    }
  }
}
