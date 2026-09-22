import path from 'node:path';
import { expect, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');

/**
 * Screenshot spec for the new design system + Pipeline Wall.
 *
 *   1. /requisitions              – vacancy grid on the new tokens
 *   2. /requisitions/[id]         – Pipeline Wall (default tab)
 *   3. /candidates                – confirms the workspace background paints
 */

test('requisitions grid uses design-system tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/requisitions?view=grid', { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('heading', { name: /job requisitions/i }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__ds-requisitions-grid.png'),
    fullPage: false,
  });
});

test('requisition detail shows the Pipeline Wall by default', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/requisitions', { waitUntil: 'networkidle' });
  const firstManage = page.getByRole('link', { name: /^manage$/i }).first();
  if (!(await firstManage.isVisible().catch(() => false))) {
    test.skip(true, 'No requisitions in this environment');
  }
  await firstManage.click();
  await page.waitForURL(/\/requisitions\/[0-9a-f-]+/i);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('text=/matched|Matched/i', { timeout: 15_000 });
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__ds-pipeline-wall.png'),
    fullPage: true,
  });
});

test('candidates page renders on the workspace background', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/candidates', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /candidates/i }).first()).toBeVisible();
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__ds-candidates.png'),
    fullPage: false,
  });
});
