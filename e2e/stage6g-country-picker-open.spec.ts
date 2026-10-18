import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SHOTS_DIR = path.resolve('playwright/stage6g-screen02-new-lead');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('country picker open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/leads?assigned=all');
  await expect(page.getByRole('heading', { name: /^Leads$/i })).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole('button', { name: /New lead/i })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Country calling code/i }).click();
  await expect(page.getByPlaceholder(/Search country or code/i)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'country-picker-open.png'),
    fullPage: false,
  });
  // Also take a screenshot after typing to filter
  await page.getByPlaceholder(/Search country or code/i).fill('ire');
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(SHOTS_DIR, 'country-picker-search.png'),
    fullPage: false,
  });
});
