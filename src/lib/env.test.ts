import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from './env';

/**
 * Force a fresh evaluation of `./env` each call. The `?fresh${n}` query
 * string is a Vite cache-buster; the runtime-constructed specifier keeps
 * TypeScript from statically resolving (and rejecting) the unknown module.
 */
function importEnvFresh(n: number): Promise<unknown> {
  const spec = `./env?fresh${n}`;
  return import(/* @vite-ignore */ spec);
}

describe('env', () => {
  it('loads and validates without throwing', () => {
    expect(env.NODE_ENV).toBeDefined();
    expect(env.LOG_LEVEL).toBeDefined();
    expect(env.DATABASE_URL).toBeDefined();
  });
});

/**
 * Production boot guards. Each test isolates `process.env`, sets a minimal
 * valid production configuration, then twiddles one variable to prove the
 * guard fires or is silent. `vi.resetModules()` forces a fresh evaluation of
 * `env.ts` so the module-level guard runs on every import.
 */
describe('production boot guards', () => {
  const base: Record<string, string> = {
    DATABASE_URL: 'postgres://user:pass@example.com/db',
    AUTH_SECRET: 'x'.repeat(32),
    AUTH_URL: 'https://example.com',
    AWS_REGION: 'eu-west-1',
    S3_BUCKET_DOCUMENTS: 'career-ireland-documents-prod',
    CRON_SECRET: 'y'.repeat(32),
    // 32 zero bytes, base64 encoded.
    EMAIL_CRED_ENC_KEY: Buffer.alloc(32).toString('base64'),
    // Mail settings — required in production (the console mailer is refused).
    MAIL_PROVIDER: 'resend',
    MAIL_FROM: 'Career Ireland <no-reply@example.com>',
    RESEND_API_KEY: 're_test_1234567890',
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
  };

  beforeEach(() => {
    delete process.env.NEXT_PHASE;
    // Clear any inherited overrides from earlier tests / .env.local before
    // seeding the baseline. Empty-string stubs would break `.url().optional()`
    // (empty is a valid string, then `.url()` fails) so we DELETE rather than
    // stub, then set only what we want.
    for (const k of [
      'S3_ENDPOINT',
      'S3_FORCE_PATH_STYLE',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ]) {
      delete process.env[k];
    }
    for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('boots when config is valid and no S3_ENDPOINT is set', async () => {
    await expect(importEnvFresh(1)).resolves.toBeDefined();
  });

  it('refuses to boot when S3_ENDPOINT points at localhost', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:9000');
    await expect(importEnvFresh(2)).rejects.toThrow(/looks like a dev backend/i);
  });

  it('refuses to boot when S3_ENDPOINT points at 127.0.0.1', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://127.0.0.1:9000');
    await expect(importEnvFresh(3)).rejects.toThrow(/dev backend/i);
  });

  it('refuses to boot when S3_ENDPOINT is a private-network host', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://10.0.0.5:9000');
    await expect(importEnvFresh(4)).rejects.toThrow(/dev backend/i);
  });

  it('refuses to boot when S3_ENDPOINT is a *.local mDNS host', async () => {
    vi.stubEnv('S3_ENDPOINT', 'http://minio.local:9000');
    await expect(importEnvFresh(5)).rejects.toThrow(/dev backend/i);
  });

  it('accepts a real S3-compatible endpoint (Cloudflare R2)', async () => {
    vi.stubEnv('S3_ENDPOINT', 'https://abc123.r2.cloudflarestorage.com');
    await expect(importEnvFresh(6)).resolves.toBeDefined();
  });

  it('refuses to boot when CRON_SECRET is missing in production', async () => {
    vi.stubEnv('CRON_SECRET', '');
    await expect(importEnvFresh(7)).rejects.toThrow(/CRON_SECRET/);
  });

  it('refuses to boot when EMAIL_CRED_ENC_KEY is missing in production', async () => {
    vi.stubEnv('EMAIL_CRED_ENC_KEY', '');
    await expect(importEnvFresh(8)).rejects.toThrow(/EMAIL_CRED_ENC_KEY/);
  });

  it('refuses to boot when EMAIL_CRED_ENC_KEY decodes to the wrong length', async () => {
    vi.stubEnv('EMAIL_CRED_ENC_KEY', Buffer.alloc(16).toString('base64'));
    await expect(importEnvFresh(9)).rejects.toThrow(/32 bytes/);
  });

  it('skips runtime guards during phase-production-build (Next.js build step)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('EMAIL_CRED_ENC_KEY', '');
    vi.stubEnv('S3_ENDPOINT', 'http://localhost:9000');
    process.env.NEXT_PHASE = 'phase-production-build';
    await expect(importEnvFresh(10)).resolves.toBeDefined();
  });

  it('refuses to boot when MAIL_FROM is missing in production', async () => {
    vi.stubEnv('MAIL_FROM', '');
    await expect(importEnvFresh(11)).rejects.toThrow(/MAIL_FROM/);
  });

  it('refuses to boot when MAIL_PROVIDER=resend but RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(importEnvFresh(12)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('refuses to boot when MAIL_PROVIDER=console in production', async () => {
    vi.stubEnv('MAIL_PROVIDER', 'console');
    // With console we don't need RESEND_API_KEY; clear it so the check doesn't
    // trip that guard first.
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(importEnvFresh(13)).rejects.toThrow(/MAIL_PROVIDER=console/i);
  });
});
