import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { autoCloseStaleAttendance } from '@/modules/hr/service';

/**
 * Nightly cron — closes attendance sessions left open past a
 * threshold (see ATTENDANCE_AUTO_CLOSE_HOURS in the service). Each
 * closure is audit-logged. Bearer-token authenticated, timing-safe,
 * fail-closed in production if CRON_SECRET is unset.
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
      logger.error('attendance-auto-close cron hit but CRON_SECRET is not set');
      return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
    }
  } else {
    const expected = `Bearer ${env.CRON_SECRET}`;
    if (!safeEqual(authHeader, expected)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await autoCloseStaleAttendance();
    logger.info({ result }, 'attendance-auto-close cron completed');
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'attendance-auto-close cron failed');
    return NextResponse.json({ ok: false, error: 'auto-close failed' }, { status: 500 });
  }
}
