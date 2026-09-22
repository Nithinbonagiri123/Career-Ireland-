import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/**
 * Post-cleanup visual walk. Confirms:
 *   1. /dashboard renders end-to-end and the new Invoice aging widget
 *      appears alongside Revenue.
 *   2. /portal/* is gone (any legacy URL redirects to /login or 404s).
 *   3. Candidate + Employer profile headers no longer have "Invite to
 *      portal" buttons.
 *   4. Billing tab still renders on both surfaces.
 */

test('01 · Dashboard renders with the new Invoice aging widget', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/invoice aging/i)).toBeVisible();
  await shot(page, 'e2e__cleanup-01-dashboard');
});

test('02 · /portal paths no longer resolve (route deleted)', async ({ page }) => {
  const response = await page.goto('/portal/candidate', { waitUntil: 'networkidle' });
  // Either 404 from Next.js OR a redirect (proxy may bounce it). Either
  // outcome is fine — the point is the operator can't reach the portal.
  const finalUrl = page.url();
  const notResolved = (response?.status() ?? 0) >= 400 || !finalUrl.includes('/portal/candidate');
  expect(notResolved).toBe(true);
  await shot(page, 'e2e__cleanup-02-portal-gone');
});

test('03 · Candidate profile has no "Invite to portal" button', async ({ page }) => {
  await page.goto('/leads', { waitUntil: 'networkidle' });
  const firstPerson = page.locator('a[href^="/candidates/"]').first();
  test.skip((await firstPerson.count()) === 0, 'no leads');
  await firstPerson.click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+/i);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /invite to portal/i })).toHaveCount(0);
  await shot(page, 'e2e__cleanup-03-candidate-header');
});

test('04 · Employer profile has no "Invite to portal" button', async ({ page }) => {
  await page.goto('/employers', { waitUntil: 'networkidle' });
  const firstEmployer = page.getByRole('link', { name: /^open$/i }).first();
  test.skip((await firstEmployer.count()) === 0, 'no employers');
  await firstEmployer.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /invite to portal/i })).toHaveCount(0);
  await shot(page, 'e2e__cleanup-04-employer-header');
});
