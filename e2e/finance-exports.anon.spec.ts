import { expect, test } from '@playwright/test';

/**
 * S1 — financial exports with no session. The proxy redirects private
 * paths to /login; a 401/403 from the route would be equally closed.
 * Either way the response must carry no CSV.
 */

const FINANCE_ENDPOINTS = [
  '/api/export/payments',
  '/api/export/revenue-services?from=2026-01-01&to=2026-12-31',
  '/api/reports/revenue?days=90',
];

for (const url of FINANCE_ENDPOINTS) {
  test(`anonymous request to ${url.split('?')[0]} returns no financial data`, async ({
    request,
  }) => {
    const r = await request.get(url, { maxRedirects: 0 });
    expect([307, 401, 403]).toContain(r.status());
    if (r.status() === 307) expect(r.headers().location ?? '').toMatch(/\/login/);
    expect(r.headers()['content-type'] ?? '').not.toContain('text/csv');
    expect(r.headers()['content-disposition']).toBeUndefined();
    const body = await r.text();
    expect(body).not.toMatch(/Amount|Total amount|Proof reference/);
  });
}
