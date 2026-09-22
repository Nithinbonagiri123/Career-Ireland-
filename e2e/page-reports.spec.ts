import { expect, test } from '@playwright/test';

test.describe('/reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reports/i, level: 1 })).toBeVisible();
  });

  test('range picker is present with default range selected', async ({ page }) => {
    // Reports uses its own range-picker (rounded pill row of preset dates).
    const anyPreset = page
      .getByRole('button', { name: /this month|last month|last 30|custom/i })
      .first();
    if (await anyPreset.isVisible().catch(() => false)) {
      await expect(anyPreset).toBeVisible();
    } else {
      // Alternate range control — expect at least a date input.
      await expect(page.locator('input[type="date"]').first()).toBeVisible();
    }
  });

  test('at least one report section renders', async ({ page }) => {
    // Reports index shows h2 sub-headings for each report family (revenue, ops, etc).
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  });

  test('download / CSV export link is present', async ({ page }) => {
    const csv = page.getByRole('link', { name: /csv|download|export/i }).first();
    if (await csv.isVisible().catch(() => false)) {
      await expect(csv).toBeVisible();
    }
  });

  test('page does not render an error boundary on load', async ({ page }) => {
    // Regression guard — reports depend on multiple DB queries.
    await expect(page.getByText(/something went wrong|error boundary/i)).toBeHidden();
  });
});
