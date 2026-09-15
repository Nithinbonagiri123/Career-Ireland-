import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const OUT = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

test('dashboard: WorkingNowCard visible in People section', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1200 });
  const card = page.getByText(/who's working now/i).first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'polish__workingnow.png'), fullPage: false });
});

test('audit page with filters', async ({ page }) => {
  await page.goto('/admin/audit', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'polish__audit-filters.png'), fullPage: false });
});
