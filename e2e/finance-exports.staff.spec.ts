import { expect, test } from '@playwright/test';

/**
 * S1 — financial exports refuse an internal user without the Payments
 * grants. The E2E STAFF user holds main.overview / leads / candidates /
 * proformas view (global-setup.ts) but neither candidate_services.payments
 * nor main.accounts, so it used to download every payment and all revenue
 * by calling the URLs directly. Requests go straight to the endpoints —
 * not via any button.
 */

const FINANCE_ENDPOINTS = [
  '/api/export/payments',
  '/api/export/revenue-services?from=2026-01-01&to=2026-12-31',
  '/api/reports/revenue?days=90',
];

async function staffUserId(): Promise<string> {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { users } = await import('../src/lib/db/schema/users');
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-staff@ireland-careers.test'))
    .limit(1);
  if (!u) throw new Error('E2E staff user missing (global setup seeds it)');
  return u.id;
}

async function countAudit(actorId: string, entityType: string, action: string, since: Date) {
  const { and, eq, gte } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { auditEvents } = await import('../src/lib/db/schema/audit_events');
  const rows = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorUserId, actorId),
        eq(auditEvents.entityType, entityType),
        eq(auditEvents.action, action),
        gte(auditEvents.occurredAt, since),
      ),
    );
  return rows.length;
}

for (const url of FINANCE_ENDPOINTS) {
  test(`STAFF without a Payments grant is refused ${url.split('?')[0]}`, async ({ request }) => {
    const staff = await staffUserId();
    const since = new Date(Date.now() - 2_000);
    const r = await request.get(url, { maxRedirects: 0 });
    expect(r.status()).toBe(403);
    expect(r.headers()['content-type'] ?? '').not.toContain('text/csv');
    expect(r.headers()['content-disposition']).toBeUndefined();
    const body = await r.text();
    expect(body).toBe('Forbidden');
    // The refusal is on the audit log; no export event was written.
    await expect.poll(() => countAudit(staff, 'session', 'AUTH_DENIED', since)).toBeGreaterThan(0);
    expect(await countAudit(staff, 'data_export', 'EXPORTED', since)).toBe(0);
  });
}

test('a non-financial export is unchanged for the same STAFF user', async ({ request }) => {
  // Control: only payment / revenue exports were tightened.
  const r = await request.get('/api/export/leads', { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/csv');
});

test('STAFF is not shown revenue CSV buttons it cannot use', async ({ page }) => {
  await page.goto('/reports', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('a[href^="/api/reports/revenue"]')).toHaveCount(0);
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await expect(page.locator('a[href^="/api/export/revenue-services"]')).toHaveCount(0);
});
