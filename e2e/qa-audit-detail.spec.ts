import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const OUT = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

test('audit page — humanized details', async ({ page }) => {
  await page.goto('/admin/audit', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'polish__audit-humanized.png'), fullPage: true });
});
