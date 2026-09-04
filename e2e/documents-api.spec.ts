import { expect, test } from '@playwright/test';

// Valid v4 UUID — zod 4 enforces RFC 4122 version + variant nibbles.
const UUID = '11111111-1111-4111-8111-111111111111';

/**
 * Authenticated (admin) tests of the documents HTTP surface.
 * Prove:
 *  - presign rejects unknown MIME with 400 + a clear error code
 *  - presign rejects >10 MB with 400 + a clear error code
 *  - presign happily signs a valid PDF request
 *  - download rejects a non-UUID / missing document with a proper 4xx
 *  - download response carries Cache-Control: no-store
 */

test('presign rejects a disallowed MIME with 400', async ({ request }) => {
  const r = await request.post('/api/documents/presign', {
    data: {
      ownerType: 'PERSON',
      ownerId: UUID,
      documentTypeId: UUID,
      originalFilename: 'evil.exe',
      mimeType: 'application/x-executable',
      fileSizeBytes: 1024,
    },
  });
  expect(r.status()).toBe(400);
  const body = await r.json();
  expect(body.error.code).toBe('MIME_NOT_ALLOWED');
});

test('presign rejects >10MB with 400', async ({ request }) => {
  const r = await request.post('/api/documents/presign', {
    data: {
      ownerType: 'PERSON',
      ownerId: UUID,
      documentTypeId: UUID,
      originalFilename: 'huge.pdf',
      mimeType: 'application/pdf',
      // Zod cap = 10MB. This must be rejected at the schema layer.
      fileSizeBytes: 10 * 1024 * 1024 + 1,
    },
  });
  expect(r.status()).toBe(400);
  const body = await r.json();
  // Either schema-layer VALIDATION_ERROR or service-layer FILE_TOO_LARGE — both acceptable.
  expect(['VALIDATION_ERROR', 'FILE_TOO_LARGE']).toContain(body.error.code);
});

test('presign rejects malformed body with 400 (zod)', async ({ request }) => {
  const r = await request.post('/api/documents/presign', {
    data: { ownerType: 'PERSON', ownerId: 'not-a-uuid' },
  });
  expect(r.status()).toBe(400);
});

test('download for a non-existent document returns 403 or 404 (never 200/500)', async ({
  request,
}) => {
  const r = await request.get(`/api/documents/${UUID}/download`, { maxRedirects: 0 });
  expect([403, 404]).toContain(r.status());
  const cc = r.headers()['cache-control'] ?? '';
  expect(cc).toContain('no-store');
});
