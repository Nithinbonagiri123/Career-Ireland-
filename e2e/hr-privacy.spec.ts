import { expect, test } from '@playwright/test';
import { HR_PRIV_IP_IN, HR_PRIV_IP_OUT, seedWorkingUser } from './helpers/hr-privacy-fixture';

/**
 * S-HR1 — authorised side (E2E admin: ADMIN preset holds main.hr_board).
 * The HR Board and the dashboard still show the working staff member,
 * but no response — HTML or RSC payload — carries clock-in/out IPs.
 */

/** Next answers an RSC request with the flight payload, not HTML. */
function expectFlightIfRsc(r: import('@playwright/test').APIResponse) {
  const sentRsc = r.url().includes('_rsc');
  if (sentRsc) expect(r.headers()['content-type'] ?? '').toContain('text/x-component');
}

test('HR Board shows attendance but never the IP addresses', async ({ page, request }) => {
  const worker = await seedWorkingUser();
  try {
    for (const headers of [{}, { RSC: '1' }] as Array<Record<string, string>>) {
      const r = await request.get('/hr/admin?created=all', {
        headers,
        maxRedirects: 'RSC' in headers ? 2 : 0,
      });
      expect(r.status(), `redirect to ${r.headers().location}`).toBe(200);
      expectFlightIfRsc(r);
      const body = await r.text();
      expect(body).toContain(worker.fullName);
      expect(body).not.toContain(HR_PRIV_IP_IN);
      expect(body).not.toContain(HR_PRIV_IP_OUT);
      expect(body).not.toMatch(/clockInIp|clockOutIp/);
    }
    await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
    await expect(page.getByText(worker.fullName).first()).toBeVisible();
  } finally {
    await worker.cleanup();
  }
  expect(await worker.remaining()).toBe(0);
});

test("dashboard still shows who's working to an HR viewer, without IPs", async ({
  page,
  request,
}) => {
  const worker = await seedWorkingUser();
  try {
    const r = await request.get('/dashboard', { headers: { RSC: '1' }, maxRedirects: 2 });
    expect(r.status(), `redirect to ${r.headers().location}`).toBe(200);
    expectFlightIfRsc(r);
    const body = await r.text();
    expect(body).toContain(worker.fullName);
    expect(body).not.toContain(HR_PRIV_IP_IN);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'HR' })).toBeVisible();
    await expect(page.getByText(worker.fullName).first()).toBeVisible();
  } finally {
    await worker.cleanup();
  }
});

test('own attendance payload carries no IPs', async ({ request }) => {
  const r = await request.get('/hr', { headers: { RSC: '1' }, maxRedirects: 2 });
  expect(r.status(), `redirect to ${r.headers().location}`).toBe(200);
  expectFlightIfRsc(r);
  expect(await r.text()).not.toMatch(/clockInIp|clockOutIp/);
});
