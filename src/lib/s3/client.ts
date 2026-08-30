import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../env';

/**
 * S3 client. Talks to real AWS S3 in prod, or to MinIO / any S3-compatible
 * endpoint in dev when S3_ENDPOINT is set.
 *
 * `requestChecksumCalculation: 'WHEN_REQUIRED'` disables the SDK's default
 * flexible-checksum (CRC32) that MinIO doesn't accept on presigned uploads.
 * Real AWS S3 doesn't require it either, so it's safe for both.
 */
export const s3 = new S3Client({
  region: env.AWS_REGION,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  ...(env.S3_FORCE_PATH_STYLE ? { forcePathStyle: true } : {}),
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

/** True when we're talking to a non-AWS S3 (MinIO etc.). */
export const IS_LOCAL_S3 = Boolean(env.S3_ENDPOINT);

export const DOCUMENTS_BUCKET = env.S3_BUCKET_DOCUMENTS;
