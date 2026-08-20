import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { presignDocumentUpload } from '@/modules/documents/service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await presignDocumentUpload(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: err.message } },
        { status: err.code === 'AUTHENTICATION_ERROR' ? 401 : 400 },
      );
    }
    logger.error({ err }, 'presign upload failed');
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
