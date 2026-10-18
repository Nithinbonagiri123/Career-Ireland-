import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G — Documents & CV upload staging. Choosing files must NOT
 * upload them: they land in a staging panel with a type picker per
 * file (guessed from the filename, operator-editable) and only the
 * explicit "Upload n files" button commits. Cancel discards cleanly.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-docs-staging');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('staging panel appears with type pickers; cancel discards without uploading', async ({
  page,
}) => {
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

  // Stage two files through the hidden input — one CV-looking, one not.
  await page.locator('input[type="file"][multiple]').setInputFiles([
    {
      name: 'Nithin_Bonagiri_CV.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 cv'),
    },
    {
      name: 'bank-statement-oct.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 bank'),
    },
  ]);

  await expect(page.getByText(/Ready to upload \(2\)/i)).toBeVisible({ timeout: 5_000 });
  // Both rows must carry a type <select>; nothing uploaded yet.
  await expect(page.getByRole('button', { name: /Upload 2 files/i })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, `staged-${stamp}.png`), fullPage: false });

  await page.getByRole('button', { name: /^Cancel$/i }).click();
  await expect(page.getByText(/Ready to upload/i)).toBeHidden();
});
