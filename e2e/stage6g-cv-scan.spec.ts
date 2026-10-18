import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G — CV scan end-to-end. Uploads a real .docx CV through the
 * dedicated CV dropzone (Scan CV card), which auto-triggers the scan,
 * and asserts the Extracted CV Information panel actually shows
 * suggestions (the previous build's Scan buttons discarded results).
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-cv-scan');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('uploading a CV via the Scan card scans it and shows suggestions', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/candidates?assigned=all');
  await expect(page.getByRole('heading', { name: /^Candidates$/i })).toBeVisible({
    timeout: 15_000,
  });
  const openProfileLink = page.getByRole('link', { name: /open profile/i }).first();
  await expect(openProfileLink).toBeVisible({ timeout: 10_000 });
  const href = await openProfileLink.getAttribute('href');
  if (!href) throw new Error('No candidate link found');
  await page.goto(`${href.split('?')[0]}?tab=documents-candidate`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });

  // The CV dropzone's hidden input is the single-file one (the general
  // documents input is [multiple]).
  await page
    .locator('input[type="file"]:not([multiple])')
    .setInputFiles(path.resolve('e2e/fixtures/sample-cv.docx'));

  // Upload → auto-scan → suggestions render in the Extracted panel.
  await expect(page.getByText(/Not saved yet/i)).toBeVisible({ timeout: 30_000 });
  // Skills tab is default — the fixture's Skills section must surface.
  await expect(page.getByRole('button', { name: /Patient Care/i })).toBeVisible({
    timeout: 5_000,
  });
  await page.screenshot({ path: path.join(SHOTS_DIR, `scanned-${stamp}.png`) });

  // Qualifications tab shows the BSc + Certificate phrases.
  await page.getByRole('button', { name: /^Qualifications$/i }).click();
  await expect(page.getByRole('button', { name: /BSc Nursing/i })).toBeVisible({ timeout: 5_000 });

  // Discard clears the preview back to the empty state.
  await page.getByRole('button', { name: /^Discard$/i }).click();
  await expect(page.getByText(/Not scanned yet/i)).toBeVisible({ timeout: 5_000 });
});
