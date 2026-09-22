import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/**
 * Walk-through for Tracey's #5 — Work Permit Checklist on a requisition.
 *
 *  1. Requisition detail renders with the new Checklists tab.
 *  2. Skills/Qualifications autosuggest exists on the candidate profile.
 *  3. CV picker on the applications dialog labels the field optional.
 */

test('01 · Requisition page shows Checklists tab', async ({ page }) => {
  await page.goto('/requisitions', { waitUntil: 'networkidle' });
  const firstOpen = page.getByRole('link', { name: /^open$/i }).first();
  test.skip((await firstOpen.count()) === 0, 'no requisitions seeded');
  await firstOpen.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^checklists/i })).toBeVisible();
  await page.getByRole('tab', { name: /^checklists/i }).click();
  await expect(page.getByText(/work permit checklists/i).first()).toBeVisible();
  await shot(page, 'e2e__checklists-01-tab');
});

test('02 · Candidate profile skills autosuggest input renders', async ({ page }) => {
  await page.goto('/candidates', { waitUntil: 'networkidle' });
  const firstCandidate = page.locator('table a').first();
  test.skip((await firstCandidate.count()) === 0, 'no candidates seeded');
  await firstCandidate.click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+/i);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // "Add skill" opens the dialog with the autosuggest input.
  await page.getByRole('button', { name: /add skill/i }).click();
  await expect(page.getByPlaceholder(/type to search — or paste from the cv/i)).toBeVisible();
  await shot(page, 'e2e__checklists-02-skills-autosuggest');
});
