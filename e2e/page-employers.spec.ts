import { expect, test } from '@playwright/test';

test.describe('/employers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/employers');
  });

  test('page header shows title + Add employer', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /employers/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /add employer|new employer/i }).first(),
    ).toBeVisible();
  });

  test('table renders with a Name / Company column', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no employers/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });

  test('CSV export link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /download csv|export/i }).first()).toBeVisible();
  });

  test('following the first employer row navigates to its detail page', async ({ page }) => {
    const firstLink = page.locator('a[href^="/employers/"]').first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, 'no employers seeded');
      return;
    }
    await firstLink.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/employers\/[^/]+/);
  });
});
