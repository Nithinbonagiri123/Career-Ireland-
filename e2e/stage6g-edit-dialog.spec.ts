import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G — Edit details dialog visual acceptance. Opens the first
 * candidate workspace, opens the Edit details dialog and screenshots
 * it at desktop + mobile so the owner can compare with the approved
 * Screen 02 sectioned-form pattern.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-edit-dialog');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('stage 6G — Edit details dialog screenshots', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/candidates?assigned=all');
  await expect(page.getByRole('heading', { name: /^Candidates$/i })).toBeVisible({
    timeout: 15_000,
  });
  const openProfileLink = page.getByRole('link', { name: /open profile/i }).first();
  await expect(openProfileLink).toBeVisible({ timeout: 10_000 });
  await openProfileLink.click();

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole('button', { name: /edit details/i })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: /^Edit details$/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS_DIR, `desktop-${stamp}.png`) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS_DIR, `mobile-${stamp}.png`) });
});
