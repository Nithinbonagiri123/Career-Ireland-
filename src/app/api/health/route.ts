import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

/**
 * Cheap liveness + readiness probe. Suitable for a Vercel health check or
 * an uptime pinger. No auth: exposes only a "ok/not ok" + latency,
 * never leaks environment or schema info.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    logger.error({ err }, 'health check failed');
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable', latencyMs: Date.now() - start },
      { status: 503 },
    );
  }
}
