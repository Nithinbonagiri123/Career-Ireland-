import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DOCUMENTS_BUCKET, IS_LOCAL_S3, s3 } from './client';

// Re-export upload constants from the leaf module so existing callers
// (documents/service.ts, tests) keep working. Client-safe modules
// (documents/schemas.ts) should import from '@/lib/s3/limits' directly
// so they don't drag the AWS SDK + env validation into the client
// bundle when a client component pulls in the schema.
export { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from './limits';

/** Deterministic key layout: {yyyy}/{mm}/{ownerType}/{ownerId}/{documentTypeId}/{uuid}-{filename} */
export function buildObjectKey(args: {
  ownerType: 'person' | 'employer';
  ownerId: string;
  documentTypeId: string;
  originalFilename: string;
}): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = args.originalFilename.replace(/[^\w.-]+/g, '_').slice(0, 120);
  return `${yyyy}/${mm}/${args.ownerType}/${args.ownerId}/${args.documentTypeId}/${randomUUID()}-${safeName}`;
}

export async function presignUpload(args: {
  key: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<{ url: string; expiresInSeconds: number }> {
  // SSE-S3 signing on the presigned URL adds x-amz-server-side-encryption
  // to the signed headers list, which MinIO rejects unless the browser also
  // sends it verbatim. Skip it for local S3 backends — real AWS S3 buckets
  // that need SSE should enforce it via a bucket policy instead.
  const command = new PutObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: args.key,
    ContentType: args.mimeType,
    ContentLength: args.fileSizeBytes,
    ...(IS_LOCAL_S3 ? {} : { ServerSideEncryption: 'AES256' }),
  });
  const expiresInSeconds = 300;
  const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return { url, expiresInSeconds };
}

export async function presignDownload(args: { key: string }): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: args.key,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}
