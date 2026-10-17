import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { expireLeads, fetchExpirableLeadIds } from '@/modules/leads/expiry';

/**
 * Daily cron — sweeps Candidate Services leads that have been inactive
 * for >= 30 days and flips them to EXPIRED.
 *
 * ── Vercel Hobby constraints ─────────────────────────────────────────
 * Vercel Hobby allows at most one cron invocation per day. We run at
 * 02:00 UTC (see vercel.json). The eligibility SQL uses UTC via
 * Postgres `NOW()` (which is UTC in our Neon / local dev setup);
 * crossing a timezone boundary therefore never changes the outcome.
 *
 * ── 30-day boundary ──────────────────────────────────────────────────
 * `fetchExpirableLeadIds` uses `created_at < NOW() - interval '30 days'`
 * — strict less-than. A lead created exactly 30 days ago is NOT yet
 * eligible; the sweep picks it up the next day. This gives one full
 * day of grace at the boundary, which is the behaviour the UI's
 * "will expire tomorrow" badge is built around.
 *
 * ── Idempotency ──────────────────────────────────────────────────────
 * The expiry writer:
 *   1. Re-locks each candidate with FOR UPDATE
 *   2. Re-runs the eligibility check inside the tx
 *   3. Writes with `WHERE status = <previous>` guard
 * So running the sweep twice (same day, or after a failed partial run)
 * flips zero rows the second time.
 *
 * ── Auth ─────────────────────────────────────────────────────────────
 * `Authorization: Bearer $CRON_SECRET` — matches every other cron
 * endpoint. Fail-closed in production if the secret isn't set.
 *
 * ── Query params ─────────────────────────────────────────────────────
 *   ?dryRun=true  — compute eligible set, log it, write nothing
 *
 * The admin-only in-UI manual sweep uses the same code path via the
 * server action in src/modules/leads/actions.ts; this endpoint stays
 * cron-only so it isn't accidentally used from the browser.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';

  if (!env.CRON_SECRET) {
    if (env.NODE_ENV === 'production') {
      logger.error('expire-leads cron hit but CRON_SECRET is not set');
      return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
    }
  } else {
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (!safeEqual(authHeader, expected)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  try {
    if (dryRun) {
      const ids = await fetchExpirableLeadIds(db, {});
      logger.info({ eligible: ids.length }, 'expire-leads dry-run');
      return NextResponse.json({
        ok: true,
        dryRun: true,
        eligibleCount: ids.length,
        eligibleIds: ids,
      });
    }
    const result = await expireLeads();
    logger.info(
      { expired: result.expiredIds.length, skipped: result.skippedIds.length },
      'expire-leads sweep complete',
    );
    return NextResponse.json({
      ok: true,
      dryRun: false,
      expiredCount: result.expiredIds.length,
      skippedCount: result.skippedIds.length,
      expiredIds: result.expiredIds,
    });
  } catch (err) {
    logger.error({ err }, 'expire-leads sweep failed');
    return NextResponse.json({ ok: false, error: 'sweep failed' }, { status: 500 });
  }
}
