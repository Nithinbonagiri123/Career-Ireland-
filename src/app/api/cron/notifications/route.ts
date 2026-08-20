import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { runNotificationScan } from '@/modules/notifications/service';

/**
 * Daily cron endpoint. Configured in vercel.json.
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on production;
 * locally it can be invoked via curl with the same header.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const expected = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : null;
  if (expected && authHeader !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
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
