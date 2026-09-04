import { expect, test } from '@playwright/test';

const UUID = '11111111-1111-4111-8111-111111111111';

/**
 * Unauthenticated tests of the documents HTTP surface. Runs under the
 * anonymous project (no session cookie). Both endpoints must fail closed.
 *
 * Middleware intercepts anon requests to protected paths and 307-redirects
 * to /login (with callbackUrl). A 401 from the route handler is equally
 * acceptable — either proves auth is enforced. We assert the disjunction so
 * these tests stay meaningful if the middleware policy is later tightened
 * to return 401 for /api routes.
 */

async function assertClosed(status: number, location: string | undefined) {
  expect([307, 401, 403]).toContain(status);
  if (status === 307) {
    expect(location ?? '').toMatch(/\/login/);
  }
}

test('presign is not reachable for anonymous callers', async ({ request }) => {
  const r = await request.post('/api/documents/presign', {
    maxRedirects: 0,
    data: {
      ownerType: 'PERSON',
      ownerId: UUID,
      documentTypeId: UUID,
      originalFilename: 'x.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 1024,
    },
  });
  await assertClosed(r.status(), r.headers().location);
});

test('download is not reachable for anonymous callers', async ({ request }) => {
  const r = await request.get(`/api/documents/${UUID}/download`, { maxRedirects: 0 });
  await assertClosed(r.status(), r.headers().location);
});
