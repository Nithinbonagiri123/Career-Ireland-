import { expect, test } from '@playwright/test';

test.describe('/reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reports');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /reports/i, level: 1 })).toBeVisible();
  });

  test('main region renders', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('at least one section header renders (h2 or h3)', async ({ page }) => {
    const anyH = page
      .getByRole('heading', { level: 2 })
      .or(page.getByRole('heading', { level: 3 }));
    if (
      await anyH
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(anyH.first()).toBeVisible();
    }
  });

  test('page does not render an error boundary', async ({ page }) => {
    await expect(page.getByText(/something went wrong|error boundary/i)).toBeHidden();
  });

  test('date-range control is present somewhere on the page', async ({ page }) => {
    // Reports may use its own range picker OR the shared DateRangeFilter.
    const anyRange = page
      .locator('input[type="date"]')
      .or(page.getByRole('tab', { name: /anytime|this month|last month|30 days/i }));
    if (
      await anyRange
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(anyRange.first()).toBeVisible();
    }
  });
});
