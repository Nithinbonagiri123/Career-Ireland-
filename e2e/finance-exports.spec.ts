import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * S1 — financial exports, authorised side (E2E admin: ADMIN preset, which
 * holds the Payments grants). Direct requests to the endpoints still
 * return the same CSV columns and still write the export audit event.
 * The STAFF and anonymous sides live in finance-exports.staff.spec.ts and
 * finance-exports.anon.spec.ts.
 */

const ENDPOINTS = [
  {
    url: '/api/export/payments',
    file: 'payments.csv',
    header: 'Service,Amount,Currency,Method,Status,Proof reference,Verified at,Created',
    audited: 'payments',
  },
  {
    url: '/api/export/revenue-services?from=2026-01-01&to=2026-12-31',
    file: 'revenue-services',
    header: 'Service,Code,Stream,Currency,Payments,Total',
    audited: 'revenue-services',
  },
  {
    url: '/api/reports/revenue?days=90',
    file: 'revenue-90d.csv',
    header: 'Currency,Service code,Service,Payments,Total amount',
    audited: null, // the reports route never wrote an audit event; unchanged
  },
] as const;

async function exportAuditCount(actorId: string, resource: string, since: Date) {
  const { and, eq, gte, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { auditEvents } = await import('../src/lib/db/schema/audit_events');
  const rows = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.actorUserId, actorId),
        eq(auditEvents.entityType, 'data_export'),
        eq(auditEvents.action, 'EXPORTED'),
        gte(auditEvents.occurredAt, since),
        sql`${auditEvents.context}->>'resource' = ${resource}`,
      ),
    );
  return rows.length;
}

for (const e of ENDPOINTS) {
  test(`authorised user still downloads ${e.url.split('?')[0]}`, async ({ request }) => {
    const admin = await e2eAdminId();
    const since = new Date(Date.now() - 2_000);
    const r = await request.get(e.url, { maxRedirects: 0 });
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('text/csv');
    expect(r.headers()['content-disposition']).toContain(e.file);
    const body = await r.text();
    expect(body.split('\n')[0]).toBe(e.header);
    if (e.audited) {
      await expect.poll(() => exportAuditCount(admin, e.audited, since)).toBeGreaterThan(0);
    }
  });
}

test('authorised user sees the revenue CSV buttons', async ({ page }) => {
  await page.goto('/reports', { waitUntil: 'networkidle' });
  await expect(page.locator('a[href^="/api/reports/revenue"]')).toHaveCount(1);
});
