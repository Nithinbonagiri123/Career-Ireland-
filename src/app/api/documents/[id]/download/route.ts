import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { presignDocumentDownload } from '@/modules/documents/service';

/**
 * Generates a short-lived S3 GET URL and 302-redirects the browser to it.
 *
 * `Cache-Control: private, no-store` prevents shared proxies (or the browser)
 * from replaying one user's presigned URL to another. The URL itself has a
 * 5-minute expiry, but caching a 302 to that URL is still a leak surface.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Fail-closed for anonymous requests before any DB / signer work.
    await requireSession();
    const { id } = await params;
    const { url } = await presignDocumentDownload(id);
    const res = NextResponse.redirect(url, 302);
    res.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return res;
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        {
          status: err.code === 'AUTHENTICATION_ERROR' ? 401 : 403,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }
    logger.error({ err }, 'download failed');
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
