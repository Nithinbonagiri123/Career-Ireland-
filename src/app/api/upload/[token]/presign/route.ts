import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { presignUploadForToken } from '@/modules/document-upload-requests/service';

/**
 * Public S3-presign endpoint for the candidate upload page. The token
 * in the URL path is the credential; there is deliberately no session
 * check — the flow is designed for candidates without accounts. All
 * validation (token, requirement scope, mime, size) is done inside
 * `presignUploadForToken`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json();
    const result = await presignUploadForToken({ token, ...body });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message } },
        { status: err.code === 'LINK_INVALID' ? 410 : 400 },
      );
    }
    logger.error({ err }, 'token-authed presign failed');
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
