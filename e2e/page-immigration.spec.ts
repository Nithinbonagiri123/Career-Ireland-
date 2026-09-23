import { expect, test } from '@playwright/test';

test.describe('/immigration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/immigration');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /immigration/i, level: 1 })).toBeVisible();
  });

  test('Open case button is present in the header action bar', async ({ page }) => {
    // Actual button label in immigration/page.tsx is "Open case".
    await expect(page.getByRole('button', { name: /^open case$/i })).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime.first()).toBeVisible();
    await expect(anytime.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('table renders with expected columns or empty state fallback', async ({ page }) => {
    // Immigration cases aren't in the minimal seed, so both branches
    // are valid: a table with columns, or the empty-state message.
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    if (hasTable) {
      await expect(page.getByRole('columnheader', { name: /type/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /beneficiary/i })).toBeVisible();
    } else {
      await expect(page.getByText(/no cases|no immigration/i).first()).toBeVisible();
    }
  });

  test('clicking Open case opens the new-case dialog', async ({ page }) => {
    await page.getByRole('button', { name: /^open case$/i }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });
});
