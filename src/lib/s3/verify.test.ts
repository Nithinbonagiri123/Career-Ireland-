import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, describe, expect, it } from 'vitest';
import { DOCUMENTS_BUCKET, s3 } from './client';
import { ObjectVerificationError, verifyStoredObject } from './verify';

/**
 * Release-readiness WARN-3 — storage-truth verification, exercised
 * against the real (MinIO) object store. These are the guarantees both
 * register paths (staff AND the public magic-link token path) now rely
 * on: a row can only be written for an object that exists with exactly
 * the declared size and type.
 */

const KEY = `vitest-verify/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
const BODY = 'stage-b verify probe';
const SIZE = Buffer.byteLength(BODY);
const MIME = 'text/plain';

afterAll(async () => {
  await s3.send(new DeleteObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: KEY })).catch(() => {});
});

describe('verifyStoredObject', () => {
  it('passes for an object whose stored size and type match the declaration', async () => {
    await s3.send(
      new PutObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: KEY, Body: BODY, ContentType: MIME }),
    );
    await expect(
      verifyStoredObject({ key: KEY, expectedMimeType: MIME, expectedSizeBytes: SIZE }),
    ).resolves.toBeUndefined();
  });

  it('rejects a declared size that disagrees with storage', async () => {
    await expect(
      verifyStoredObject({ key: KEY, expectedMimeType: MIME, expectedSizeBytes: SIZE + 999 }),
    ).rejects.toMatchObject({ code: 'OBJECT_METADATA_MISMATCH' });
  });

  it('rejects a declared MIME type that disagrees with storage', async () => {
    await expect(
      verifyStoredObject({
        key: KEY,
        expectedMimeType: 'application/pdf',
        expectedSizeBytes: SIZE,
      }),
    ).rejects.toMatchObject({ code: 'OBJECT_METADATA_MISMATCH' });
  });

  it('rejects a key with no stored object behind it', async () => {
    let thrown: unknown;
    try {
      await verifyStoredObject({
        key: `vitest-verify/does-not-exist-${Date.now()}`,
        expectedMimeType: MIME,
        expectedSizeBytes: 1,
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ObjectVerificationError);
    expect((thrown as ObjectVerificationError).code).toBe('OBJECT_NOT_FOUND');
  });
});
