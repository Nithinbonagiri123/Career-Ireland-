import { S3Client } from '@aws-sdk/client-s3';
import { env } from '../env';

export const s3 = new S3Client({
  region: env.AWS_REGION,
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

export const DOCUMENTS_BUCKET = env.S3_BUCKET_DOCUMENTS;
