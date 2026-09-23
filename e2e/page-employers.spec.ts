import { expect, test } from '@playwright/test';

test.describe('/employers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/employers');
  });

  test('page header shows title + Add employer button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /employers/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /add employer|new employer/i }).first(),
    ).toBeVisible();
  });

  test('table renders with the Employer column', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
    // Column header is literally "Employer" (see employers-table.tsx).
    await expect(page.getByRole('columnheader', { name: /^employer$/i })).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });

  test('CSV export link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /download csv|export/i }).first()).toBeVisible();
  });

  test('following the seeded employer row navigates to its detail page', async ({ page }) => {
    // Minimal seed guarantees at least one employer exists.
    const firstLink = page.locator('a[href^="/employers/"]').first();
    await expect(firstLink).toBeVisible();
    await firstLink.click();
    await expect(page).toHaveURL(/\/employers\/[^/]+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
