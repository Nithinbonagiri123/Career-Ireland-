import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { drainFinancialEvents } from '@/modules/accounting/outbox-drain';

/**
 * Cron endpoint — drains the financial_events outbox into balanced
 * journals. Configured in vercel.json to run every minute so a newly
 * posted invoice / payment / credit note shows up in the GL within
 * ~60 s. Idempotent; a second concurrent invocation picks a different
 * batch via `FOR UPDATE SKIP LOCKED` in the drainer.
 *
 * Auth mirrors the other cron routes: timing-safe compare against
 * `CRON_SECRET`. In dev, missing secret allows unauthenticated calls
 * so `curl` from the shell works.
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
      logger.error('drain-financial-events cron hit but CRON_SECRET is not set');
      return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
    }
  } else {
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (!safeEqual(authHeader, expected)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await drainFinancialEvents();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'drain-financial-events cron: fatal');
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
