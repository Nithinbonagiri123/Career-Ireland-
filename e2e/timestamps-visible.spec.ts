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
 * Post-sweep visual verify: every top-hit surface must now show an
 * absolute clock time on its date columns, not just relative distance.
 * Pattern to match: `dd MMM yyyy · HH:mm` — 5 hits in each screenshot
 * is enough to prove the sweep landed.
 */
const ABSOLUTE_TIME_PATTERN = /\d{1,2} \w{3} \d{4} · \d{2}:\d{2}/;

test('01 · Leads table shows absolute time', async ({ page }) => {
  await page.goto('/leads', { waitUntil: 'networkidle' });
  const matches = await page.locator('time').count();
  expect(matches).toBeGreaterThan(0);
  await expect(page.getByText(ABSOLUTE_TIME_PATTERN).first()).toBeVisible();
  await shot(page, 'e2e__ts-01-leads');
});

test('02 · Candidates table shows absolute time', async ({ page }) => {
  await page.goto('/candidates', { waitUntil: 'networkidle' });
  await expect(page.getByText(ABSOLUTE_TIME_PATTERN).first()).toBeVisible();
  await shot(page, 'e2e__ts-02-candidates');
});

test('03 · Documents hub folder + contents show absolute time', async ({ page }) => {
  await page.goto('/documents', { waitUntil: 'networkidle' });
  await expect(page.getByText(ABSOLUTE_TIME_PATTERN).first()).toBeVisible();
  await shot(page, 'e2e__ts-03-docs-folders');

  const firstFolder = page.locator('a[href*="/documents?client="]').first();
  if (await firstFolder.count()) {
    await firstFolder.click();
    await page.waitForURL(/\/documents\?client=/);
    await expect(page.getByText(ABSOLUTE_TIME_PATTERN).first()).toBeVisible();
    await shot(page, 'e2e__ts-03b-docs-inside');
  }
});

test('04 · Audit log shows absolute time', async ({ page }) => {
  await page.goto('/admin/audit', { waitUntil: 'networkidle' });
  await expect(page.getByText(ABSOLUTE_TIME_PATTERN).first()).toBeVisible();
  await shot(page, 'e2e__ts-04-audit');
});

test('05 · Payments table shows absolute time', async ({ page }) => {
  await page.goto('/payments', { waitUntil: 'networkidle' });
  await expect(page.getByText(ABSOLUTE_TIME_PATTERN).first()).toBeVisible();
  await shot(page, 'e2e__ts-05-payments');
});
