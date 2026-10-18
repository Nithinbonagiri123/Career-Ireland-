import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 03 — Candidates list page visual acceptance. Captures
 * 1440 / 820 / 390 screenshots so the owner can compare with the
 * approved mockup (03_Candidates_APPROVED.png).
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-screen03-candidates');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('stage 6G Screen 03 — Candidates screenshots', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 820, height: 1180 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto('/candidates?assigned=all');
    await expect(page.getByRole('heading', { name: /^Candidates$/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${label}-${stamp}.png`),
      fullPage: true,
    });
  }
});
