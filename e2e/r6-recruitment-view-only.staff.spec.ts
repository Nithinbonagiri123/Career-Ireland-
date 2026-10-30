import { expect, test } from '@playwright/test';
import { seedOpenJob } from './helpers/fixtures';

/**
 * R6 — a STAFF user without Recruitment write grants sees employer and job
 * pages without their write controls (the server refuses the writes too —
 * src/lib/auth/r6-permissions.test.ts).
 */
test('STAFF sees employer and job pages without Recruitment write controls', async ({ page }) => {
  test.setTimeout(120_000);
  const job = await seedOpenJob();
  try {
    await page.goto(`/employers/${job.employerId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    for (const name of [/^Add contact$/, /^New requisition$/, /^Edit$/]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }

    await page.goto(`/requisitions/${job.jobId}?tab=overview`);
    await expect(page.getByRole('heading', { name: job.title })).toBeVisible({ timeout: 20_000 });
    for (const name of [/^Edit$/, /Add candidate/, /^Add skill$/, /^Add qualification$/]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    await page.goto(`/requisitions/${job.jobId}?tab=checklists`);
    await expect(page.getByRole('button', { name: /New checklist/ })).toHaveCount(0);
  } finally {
    await job.cleanup();
  }
});
