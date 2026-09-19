import { GetObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import mammoth from 'mammoth';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { cvExtractions } from '@/lib/db/schema/cv_extractions';
import { documentInstances } from '@/lib/db/schema/documents';
import { BusinessRuleError } from '@/lib/errors';
import { DOCUMENTS_BUCKET, s3 } from '@/lib/s3/client';

/**
 * CV text extraction, LLM-free.
 *
 * Reads a candidate's uploaded CV directly from S3, parses PDF or DOCX to
 * plain text, and caches the result in `cv_extractions` so subsequent
 * lookups (autosuggest, "Suggestions from CV" panel) are one query instead
 * of another S3 round-trip + parse.
 *
 * Deliberately narrow: PDF via `pdf-parse`, DOCX via `mammoth`. Both are
 * pure-JS, no native binaries, ~1MB total. Anything else (RTF, plain text,
 * .doc legacy) throws `UNSUPPORTED_MIME` and the caller renders a helpful
 * message rather than silently returning empty text.
 */

const SUPPORTED_MIMES = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  // AWS SDK v3 returns a Node Readable stream in Node runtime; iterate to Buffer.
  const chunks: Buffer[] = [];
  const readable = stream as AsyncIterable<Uint8Array>;
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function fetchObjectBuffer(objectKey: string): Promise<Buffer> {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: objectKey }),
  );
  if (!resp.Body) throw new BusinessRuleError('S3_EMPTY_BODY', 'S3 object had no body');
  return streamToBuffer(resp.Body);
}

async function parseBufferToText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    // Dynamic import — pdf-parse v2 exports a PDFParse class and touches
    // Node-only APIs at import time. Class API: `new PDFParse({ data })`
    // then `getText()` returns `{ text: string }`.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return (result.text ?? '').trim();
    } finally {
      await parser.destroy();
    }
  }
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return (value ?? '').trim();
  }
  throw new BusinessRuleError(
    'UNSUPPORTED_MIME',
    `Cannot extract text from ${mimeType}. Only PDF and Word (.docx) are supported.`,
  );
}

/**
 * Extract text from the given document instance and cache it. If the row
 * already has a cached extraction, return that immediately. If not, fetch
 * the S3 object, parse, insert, and return.
 */
export async function extractCvText(
  documentInstanceId: string,
): Promise<{ textContent: string; parsedAt: Date; cached: boolean }> {
  await requireInternalStaff();

  const [cached] = await db
    .select()
    .from(cvExtractions)
    .where(eq(cvExtractions.documentInstanceId, documentInstanceId))
    .limit(1);
  if (cached) {
    return { textContent: cached.textContent, parsedAt: cached.parsedAt, cached: true };
  }

  const [doc] = await db
    .select({
      s3ObjectKey: documentInstances.s3ObjectKey,
      mimeType: documentInstances.mimeType,
      voidedAt: documentInstances.voidedAt,
    })
    .from(documentInstances)
    .where(eq(documentInstances.id, documentInstanceId))
    .limit(1);
  if (!doc) throw new BusinessRuleError('NOT_FOUND', 'Document not found');
  if (doc.voidedAt) throw new BusinessRuleError('VOIDED', 'Document is voided');
  if (!SUPPORTED_MIMES.has(doc.mimeType)) {
    throw new BusinessRuleError(
      'UNSUPPORTED_MIME',
      `Cannot extract text from ${doc.mimeType}. Only PDF and Word (.docx) are supported.`,
    );
  }

  const buffer = await fetchObjectBuffer(doc.s3ObjectKey);
  const textContent = await parseBufferToText(buffer, doc.mimeType);

  const [row] = await db
    .insert(cvExtractions)
    .values({ documentInstanceId, textContent })
    .onConflictDoUpdate({
      target: cvExtractions.documentInstanceId,
      set: { textContent, parsedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error('cv_extractions insert returned no row');

  return { textContent: row.textContent, parsedAt: row.parsedAt, cached: false };
}
