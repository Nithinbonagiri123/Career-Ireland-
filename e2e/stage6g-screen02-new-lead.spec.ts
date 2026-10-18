import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 02 — New Lead dialog visual acceptance. Opens the
 * dialog on /leads and captures 1440 / 820 / 390 screenshots so the
 * owner can compare with the approved mockup.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-screen02-new-lead');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('stage 6G — New Lead dialog screenshots', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 820, height: 1180 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto('/leads?assigned=all');
    await expect(page.getByRole('heading', { name: /^Leads$/i })).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole('button', { name: /New lead/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Let any Framer-Motion entrance settle so the screenshot captures
    // the final layout.
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${label}-${stamp}.png`),
      fullPage: true,
    });
  }
});
