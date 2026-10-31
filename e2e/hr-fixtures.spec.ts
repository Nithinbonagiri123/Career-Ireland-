import { expect, test } from '@playwright/test';
import { seedHrScenario } from './helpers/hr-fixtures';

/**
 * The HR fixture seeds visible, self-cleaning attendance data: every
 * fixture person appears on the HR Board and as the admin's direct report,
 * and cleanup leaves nothing behind.
 */
test('HR fixture seeds visible attendance and cleans up exactly', async ({ page }) => {
  test.setTimeout(120_000);
  const hr = await seedHrScenario();
  try {
    await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
    for (const name of Object.values(hr.names)) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
    await page.goto('/hr/team', { waitUntil: 'networkidle' });
    for (const name of Object.values(hr.names)) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
  } finally {
    await hr.cleanup();
  }
  expect(await hr.remaining()).toEqual({ users: 0, profiles: 0, sessions: 0, breaks: 0 });
});
