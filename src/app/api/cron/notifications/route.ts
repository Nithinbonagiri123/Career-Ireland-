import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { runNotificationScan } from '@/modules/notifications/service';

/**
 * Daily cron endpoint. Configured in vercel.json.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on production;
 * locally it can be invoked via curl with the same header.
 *
 * Uses `timingSafeEqual` to defeat timing-attack probes on the shared secret.
 * In production, refuses to run if CRON_SECRET is unset (fail-closed).
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — bail before it does.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';

  // Fail-closed in production: missing CRON_SECRET means the endpoint is unreachable.
  if (!env.CRON_SECRET) {
    if (env.NODE_ENV === 'production') {
      logger.error('cron endpoint hit but CRON_SECRET is not set');
      return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
    }
    // In dev, allow unauthenticated calls so `curl` from the shell works.
  } else {
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (!safeEqual(authHeader, expected)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runNotificationScan();
    logger.info({ result }, 'notification cron completed');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'notification cron failed');
    return NextResponse.json({ ok: false, error: 'scan failed' }, { status: 500 });
  }
}
