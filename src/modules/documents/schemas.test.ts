import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '@/lib/s3/presign';
import { PresignUploadSchema, RegisterUploadSchema, ReviewDocumentSchema } from './schemas';

// Valid v4 UUIDs — zod 4 enforces the RFC 4122 version + variant nibbles.
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

const validPresign = {
  ownerType: 'PERSON' as const,
  ownerId: UUID_A,
  documentTypeId: UUID_B,
  originalFilename: 'cv.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1024,
};

describe('PresignUploadSchema', () => {
  it('accepts a valid person-owned upload request', () => {
    expect(PresignUploadSchema.safeParse(validPresign).success).toBe(true);
  });

  it('accepts EMPLOYER owner type', () => {
    expect(PresignUploadSchema.safeParse({ ...validPresign, ownerType: 'EMPLOYER' }).success).toBe(
      true,
    );
  });

  it('rejects unknown owner type', () => {
    expect(
      PresignUploadSchema.safeParse({ ...validPresign, ownerType: 'PORTAL' as unknown as 'PERSON' })
        .success,
    ).toBe(false);
  });

  it('rejects non-UUID ownerId', () => {
    expect(PresignUploadSchema.safeParse({ ...validPresign, ownerId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('rejects zero or negative file size', () => {
    expect(PresignUploadSchema.safeParse({ ...validPresign, fileSizeBytes: 0 }).success).toBe(
      false,
    );
    expect(PresignUploadSchema.safeParse({ ...validPresign, fileSizeBytes: -1 }).success).toBe(
      false,
    );
  });

  it('rejects non-integer file size', () => {
    expect(PresignUploadSchema.safeParse({ ...validPresign, fileSizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects file size above the shared MAX_UPLOAD_BYTES cap', () => {
    expect(
      PresignUploadSchema.safeParse({ ...validPresign, fileSizeBytes: MAX_UPLOAD_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it('accepts file size exactly at MAX_UPLOAD_BYTES', () => {
    expect(
      PresignUploadSchema.safeParse({ ...validPresign, fileSizeBytes: MAX_UPLOAD_BYTES }).success,
    ).toBe(true);
  });

  it('rejects empty filename', () => {
    expect(PresignUploadSchema.safeParse({ ...validPresign, originalFilename: '' }).success).toBe(
      false,
    );
  });

  it('rejects extremely long filename (>255)', () => {
    expect(
      PresignUploadSchema.safeParse({ ...validPresign, originalFilename: 'a'.repeat(256) }).success,
    ).toBe(false);
  });
});

describe('RegisterUploadSchema', () => {
  const validRegister = {
    ...validPresign,
    s3ObjectKey: '2026/09/person/foo/bar/deadbeef-cv.pdf',
  };

  it('accepts a valid register call', () => {
    expect(RegisterUploadSchema.safeParse(validRegister).success).toBe(true);
  });

  it('accepts optional expiresOn as ISO date', () => {
    const r = RegisterUploadSchema.safeParse({ ...validRegister, expiresOn: '2028-06-30' });
    expect(r.success).toBe(true);
  });

  it('accepts empty expiresOn (blank field)', () => {
    expect(RegisterUploadSchema.safeParse({ ...validRegister, expiresOn: '' }).success).toBe(true);
  });

  it('rejects invalid expiresOn', () => {
    expect(
      RegisterUploadSchema.safeParse({ ...validRegister, expiresOn: 'not-a-date' }).success,
    ).toBe(false);
  });

  it('accepts fulfilRequirementIds as an array of UUIDs', () => {
    const r = RegisterUploadSchema.safeParse({
      ...validRegister,
      fulfilRequirementIds: [UUID_A, UUID_C],
    });
    expect(r.success).toBe(true);
  });

  it('rejects fulfilRequirementIds with a non-UUID', () => {
    expect(
      RegisterUploadSchema.safeParse({
        ...validRegister,
        fulfilRequirementIds: ['not-a-uuid'],
      }).success,
    ).toBe(false);
  });
});

describe('ReviewDocumentSchema', () => {
  it('accepts ACCEPTED and REJECTED', () => {
    expect(
      ReviewDocumentSchema.safeParse({ documentInstanceId: UUID_A, decision: 'ACCEPTED' }).success,
    ).toBe(true);
    expect(
      ReviewDocumentSchema.safeParse({ documentInstanceId: UUID_A, decision: 'REJECTED' }).success,
    ).toBe(true);
  });

  it('rejects any other decision', () => {
    expect(
      ReviewDocumentSchema.safeParse({
        documentInstanceId: UUID_A,
        decision: 'PENDING' as unknown as 'ACCEPTED',
      }).success,
    ).toBe(false);
  });

  it('accepts optional reviewNotes', () => {
    expect(
      ReviewDocumentSchema.safeParse({
        documentInstanceId: UUID_A,
        decision: 'REJECTED',
        reviewNotes: 'blurry scan',
      }).success,
    ).toBe(true);
  });

  it('rejects reviewNotes >2000 chars', () => {
    expect(
      ReviewDocumentSchema.safeParse({
        documentInstanceId: UUID_A,
        decision: 'REJECTED',
        reviewNotes: 'x'.repeat(2001),
      }).success,
    ).toBe(false);
  });
});
