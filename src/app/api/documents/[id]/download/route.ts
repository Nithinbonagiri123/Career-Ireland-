import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { presignDocumentDownload } from '@/modules/documents/service';

/** Generates a short-lived S3 GET URL and 302-redirects the browser to it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { url } = await presignDocumentDownload(id);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.code === 'AUTHENTICATION_ERROR' ? 401 : 403 },
      );
    }
    logger.error({ err }, 'download failed');
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
