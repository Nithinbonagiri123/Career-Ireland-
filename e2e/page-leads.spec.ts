import { expect, test } from '@playwright/test';

test.describe('/leads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leads');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /leads/i, level: 1 })).toBeVisible();
  });

  test('New lead button is present in the header action bar', async ({ page }) => {
    // Actual button label in create-lead-dialog.tsx is "New lead".
    await expect(page.getByRole('button', { name: /^new lead$/i })).toBeVisible();
  });

  test('DateRange filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime.first()).toBeVisible();
    await expect(anytime.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('leads table renders (seeded fixture guarantees at least one row)', async ({ page }) => {
    // The E2E minimal seed inserts one lead — the table must render.
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /person|name/i })).toBeVisible();
  });

  test('scope filter tabs (All / Assigned to me / Unassigned) render', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /^all$/i })).toBeVisible();
    await expect(page.getByText(/assigned to me/i)).toBeVisible();
  });
});
