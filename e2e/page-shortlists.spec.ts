import { expect, test } from '@playwright/test';

// R5 — /shortlists is the global shortlist workspace (it used to be a job picker).
test.describe('/shortlists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shortlists');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /shortlists/i, level: 1 })).toBeVisible();
  });

  test('current and removal-history views are both reachable', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Shortlist views' });
    await expect(nav.getByRole('link', { name: 'Shortlisted' })).toBeVisible();
    await nav.getByRole('link', { name: 'Removal history' }).click();
    await expect(page).toHaveURL(/view=removed/);
  });

  test('page does not render an error boundary', async ({ page }) => {
    await expect(page.getByText(/something went wrong|error boundary/i)).toBeHidden();
  });
});
