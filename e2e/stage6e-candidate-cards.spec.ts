import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6E — Candidate card spacing before/after screenshots.
 *
 * No seeding — uses the real card grid as it stands. Captures full-page
 * screenshots at desktop (1440×900), tablet (820×1180) and mobile
 * (390×844) widths so the designer can compare before/after.
 */

const SHOTS_DIR = path.resolve('playwright/stage6e-candidate-cards');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('candidate cards grid — desktop + tablet + mobile', async ({ page }) => {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 820, height: 1180 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto('/candidates?assigned=all&view=grid');
    // Wait for any candidate card OR the empty state — whichever renders.
    await expect(
      page
        .locator('[aria-label^="Candidate "]')
        .or(page.getByText(/no candidates/i))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${label}-cards.png`),
      fullPage: true,
    });
  }
});
