import { expect, test } from '@playwright/test';
import { HR_PRIV_IP_IN, HR_PRIV_IP_OUT, seedWorkingUser } from './helpers/hr-privacy-fixture';

/**
 * S-HR1 — a user with dashboard access but no HR Board grant (the E2E
 * STAFF user: main.overview.view, no main.hr_board — the same position
 * as the FINANCE preset) gets neither the "who's working now" card nor
 * the attendance data behind it. Checked on the raw HTML and on the RSC
 * (flight) payload, not just what is visible.
 */

/** Next answers an RSC request with the flight payload, not HTML. */
function expectFlightIfRsc(r: import('@playwright/test').APIResponse) {
  const sentRsc = r.url().includes('_rsc');
  if (sentRsc) expect(r.headers()['content-type'] ?? '').toContain('text/x-component');
}

test('dashboard sends no staff attendance to a user without HR access', async ({
  page,
  request,
}) => {
  const worker = await seedWorkingUser();
  try {
    for (const headers of [{}, { RSC: '1' }] as Array<Record<string, string>>) {
      const r = await request.get('/dashboard', {
        headers,
        maxRedirects: 'RSC' in headers ? 2 : 0,
      });
      expect(r.status(), `redirect to ${r.headers().location}`).toBe(200);
      expectFlightIfRsc(r);
      const body = await r.text();
      expect(body).not.toContain(worker.fullName);
      expect(body).not.toContain(worker.email);
      expect(body).not.toContain(HR_PRIV_IP_IN);
      expect(body).not.toMatch(/clockInIp|clockOutIp|onBreakSince/);
    }
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'HR' })).toHaveCount(0);
    await expect(page.getByText(/working now/i)).toHaveCount(0);
  } finally {
    await worker.cleanup();
  }
  expect(await worker.remaining()).toBe(0);
});

test('My attendance shows no team data to a user without HR access', async ({ request }) => {
  const worker = await seedWorkingUser();
  try {
    const r = await request.get('/hr', { headers: { RSC: '1' }, maxRedirects: 2 });
    expect(r.status(), `redirect to ${r.headers().location}`).toBe(200);
    expectFlightIfRsc(r);
    const body = await r.text();
    expect(body).not.toContain(worker.fullName);
    expect(body).not.toContain(HR_PRIV_IP_IN);
    expect(body).not.toContain(HR_PRIV_IP_OUT);
    expect(body).not.toMatch(/across the team right now/);
  } finally {
    await worker.cleanup();
  }
});

test('HR Board stays closed to a user without HR access', async ({ request }) => {
  const worker = await seedWorkingUser();
  try {
    const r = await request.get('/hr/admin?created=all', { maxRedirects: 0 });
    // Unchanged existing behaviour: the proxy sends non-ADMIN roles to /hr.
    expect([302, 303, 307, 308]).toContain(r.status());
    expect(r.headers().location ?? '').toMatch(/\/hr$/);
    const body = await r.text();
    expect(body).not.toContain(worker.fullName);
    expect(body).not.toContain(HR_PRIV_IP_IN);
  } finally {
    await worker.cleanup();
  }
});
