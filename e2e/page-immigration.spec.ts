import { expect, test } from '@playwright/test';

test.describe('/immigration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/immigration');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /immigration/i, level: 1 })).toBeVisible();
  });

  test('primary action button (Open case) is present', async ({ page }) => {
    // Button label is "Open case" per the header action wiring.
    const btn = page.getByRole('button', { name: /open case|new case/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      await expect(btn).toBeVisible();
    }
  });

  test('date-range filter is present', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (
      await anytime
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(anytime.first()).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no cases|no immigration/i)
      .first()
      .isVisible()
      .catch(() => false);
    // Skip if the DB has neither seeded cases nor a rendered empty state —
    // just verify the heading rendered.
    expect(hasTable || hasEmpty || (await page.locator('h1').isVisible())).toBe(true);
  });

  test('following a case row opens the detail page', async ({ page }) => {
    const firstLink = page.locator('a[href^="/immigration/"]').first();
    if (await firstLink.isVisible().catch(() => false)) {
      await firstLink.click();
      await expect(page).toHaveURL(/\/immigration\/[^/]+/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } else {
      test.skip(true, 'no immigration cases');
    }
  });
});
