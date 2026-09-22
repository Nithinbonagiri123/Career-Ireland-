import path from 'node:path';
import { expect, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');

test('dashboard shows the sticky-note KPI wall', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /today/i })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, 'e2e__ds-dashboard.png'), fullPage: true });
});
