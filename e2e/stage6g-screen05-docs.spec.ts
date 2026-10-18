import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 05 — Documents & CV tab visual acceptance.
 * Opens the first candidate workspace with ?tab=documents-candidate and
 * screenshots 1440 / 820 / 390 so the owner can compare with the
 * approved mockup (05_Documents_CV_APPROVED.png).
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-screen05-docs');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('stage 6G Screen 05 — Documents & CV screenshots', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);

  // Pick a candidate id from the list first.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/candidates?assigned=all');
  await expect(page.getByRole('heading', { name: /^Candidates$/i })).toBeVisible({
    timeout: 15_000,
  });
  const openWorkspaceLink = page.getByRole('link', { name: /open profile/i }).first();
  await expect(openWorkspaceLink).toBeVisible({ timeout: 10_000 });
  const href = await openWorkspaceLink.getAttribute('href');
  if (!href) throw new Error('No candidate workspace link found');

  // Jump straight to the Documents & CV tab.
  const url = href.includes('?')
    ? `${href.split('?')[0]}?tab=documents-candidate`
    : `${href}?tab=documents-candidate`;
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 820, height: 1180 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${label}-${stamp}.png`),
      fullPage: true,
    });
  }
});
