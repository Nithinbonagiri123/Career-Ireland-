import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { DOCUMENTS_BUCKET, s3 } from './client';

/**
 * Stage B Wave 1 (client remediation #7) — confirm a to-be-registered
 * object actually exists in storage and that its stored metadata matches
 * what the caller declares. The presigned PUT pins ContentType and
 * ContentLength into the signature, so the stored values are
 * authoritative; a register call that disagrees is either a mistake or
 * an attempt to make the database row lie about the file.
 */
export async function verifyStoredObject(args: {
  key: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
}): Promise<void> {
  let head: { ContentLength?: number; ContentType?: string };
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: args.key }));
  } catch (err) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'NotFound' || name === 'NoSuchKey' || name === '404') {
      throw new ObjectVerificationError(
        'OBJECT_NOT_FOUND',
        'The uploaded file was not found in storage. Upload it again before saving.',
      );
    }
    throw err;
  }
  if (head.ContentLength !== undefined && head.ContentLength !== args.expectedSizeBytes) {
    throw new ObjectVerificationError(
      'OBJECT_METADATA_MISMATCH',
      'The stored file size does not match the upload. Upload the file again.',
    );
  }
  if (head.ContentType !== undefined && head.ContentType !== args.expectedMimeType) {
    throw new ObjectVerificationError(
      'OBJECT_METADATA_MISMATCH',
      'The stored file type does not match the upload. Upload the file again.',
    );
  }
}

/** Local error type so callers can map to their own error taxonomy
 *  without importing the app-wide error classes into this S3 helper. */
export class ObjectVerificationError extends Error {
  code: 'OBJECT_NOT_FOUND' | 'OBJECT_METADATA_MISMATCH';
  constructor(code: 'OBJECT_NOT_FOUND' | 'OBJECT_METADATA_MISMATCH', message: string) {
    super(message);
    this.code = code;
  }
}
