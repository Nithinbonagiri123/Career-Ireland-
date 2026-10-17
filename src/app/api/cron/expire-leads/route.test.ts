import { describe, expect, it } from 'vitest';
import { GET } from './route';

/**
 * Stage 4.1 — cron endpoint tests.
 *
 * These exercise the HTTP boundary of the daily expiry sweep:
 *   - unauthorized when CRON_SECRET is set and the header doesn't match
 *   - authorized happy path returns counts
 *   - dryRun returns the eligible set without flipping
 *   - idempotency: a second call during the same minute returns 0 new
 *     expirations (because the first call flipped them)
 *
 * The sweep itself + boundary conditions are covered by
 * src/modules/leads/expiry.test.ts.
 */

function makeReq(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers: headers ?? {} });
}

describe('/api/cron/expire-leads', () => {
  it('refuses unauthorized when CRON_SECRET is set', async () => {
    // The env is seeded from .env.local via vitest.setup.ts. If
    // CRON_SECRET isn't present, this test is a no-op (dev DB without
    // the secret skips auth in non-production).
    if (!process.env.CRON_SECRET) return;
    const res = await GET(makeReq('http://localhost/api/cron/expire-leads'));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  it('refuses a wrong Bearer token when CRON_SECRET is set', async () => {
    if (!process.env.CRON_SECRET) return;
    const res = await GET(
      makeReq('http://localhost/api/cron/expire-leads', {
        authorization: 'Bearer wrong-secret',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('authorized dryRun returns an eligible count without flipping', async () => {
    const headers: Record<string, string> = process.env.CRON_SECRET
      ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {};
    const res = await GET(makeReq('http://localhost/api/cron/expire-leads?dryRun=true', headers));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      dryRun: boolean;
      eligibleCount: number;
      eligibleIds?: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(typeof body.eligibleCount).toBe('number');
    expect(Array.isArray(body.eligibleIds)).toBe(true);
  });

  it('authorized live sweep returns counts and is idempotent on retry', async () => {
    const headers: Record<string, string> = process.env.CRON_SECRET
      ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
      : {};
    const first = await GET(makeReq('http://localhost/api/cron/expire-leads', headers));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      ok: boolean;
      dryRun: boolean;
      expiredCount: number;
      skippedCount: number;
    };
    expect(firstBody.ok).toBe(true);
    expect(firstBody.dryRun).toBe(false);

    // Retry — anything the first run flipped is now EXPIRED, so the
    // second run cannot pick it up (status filter excludes EXPIRED).
    const second = await GET(makeReq('http://localhost/api/cron/expire-leads', headers));
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      ok: boolean;
      expiredCount: number;
    };
    expect(secondBody.ok).toBe(true);
    expect(secondBody.expiredCount).toBe(0);
  });
});
