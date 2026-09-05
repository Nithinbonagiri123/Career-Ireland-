import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { cleanUpStaleDrafts } from '@/modules/candidates/onboarding-service';

/**
 * Nightly cron — deletes abandoned candidate-onboarding drafts older than
 * DRAFT_MAX_AGE_DAYS (currently 7). Audit rows are written for each culled
 * draft so accounting has a paper trail.
 *
 * Auth model matches other cron endpoints: `Authorization: Bearer $CRON_SECRET`.
 * Fail-closed if the secret isn't set in production.
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
      logger.error('candidate-drafts cron hit but CRON_SECRET is not set');
      return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
    }
  } else {
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (!safeEqual(authHeader, expected)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await cleanUpStaleDrafts();
    logger.info({ result }, 'candidate-drafts cleanup completed');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'candidate-drafts cleanup failed');
    return NextResponse.json({ ok: false, error: 'cleanup failed' }, { status: 500 });
  }
}
