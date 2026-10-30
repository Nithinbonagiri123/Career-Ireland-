import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { seedCandidate, seedOpenJob } from './helpers/fixtures';

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
  // R6 — its own job instead of skipping when none is listed.
  const job = await seedOpenJob();
  try {
    await page.goto(`/requisitions/${job.jobId}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^checklists/i })).toBeVisible();
    await page.getByRole('tab', { name: /^checklists/i }).click();
    await expect(page.getByText(/work permit checklists/i).first()).toBeVisible();
    await shot(page, 'e2e__checklists-01-tab');
  } finally {
    await job.cleanup();
  }
});

test('02 · Candidate profile skills autosuggest input renders', async ({ page }) => {
  // R6 — its own candidate instead of skipping when the list is empty.
  const candidate = await seedCandidate();
  try {
    await page.goto(`/candidates/${candidate.personId}`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    // The Skills row's "+ Add" link leads to the Profile tab, whose
    // "Add skill" opens the dialog with the autosuggest input.
    await page
      .getByText('Skills', { exact: true })
      .locator('..')
      .getByRole('link', { name: /add/i })
      .first()
      .click();
    await page
      .getByRole('button', { name: /add skill/i })
      .first()
      .click({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/type to search — or paste from the cv/i)).toBeVisible();
    await shot(page, 'e2e__checklists-02-skills-autosuggest');
  } finally {
    await candidate.cleanup();
  }
});
