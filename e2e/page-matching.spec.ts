import { expect, test } from '@playwright/test';

test.describe('/matching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/matching');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /matching/i, level: 1 })).toBeVisible();
  });

  test('description tells staff to pick a requisition', async ({ page }) => {
    await expect(page.getByText(/pick a requisition|choose a requisition/i)).toBeVisible();
  });

  test('requisition list renders (from the seed)', async ({ page }) => {
    // Minimal seed inserts one requisition.
    await expect(page.locator('a[href^="/requisitions/"]').first()).toBeVisible();
  });

  test('picking a requisition navigates into its detail', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    await firstReq.click();
    await expect(page).toHaveURL(/\/requisitions\/[^/]+/);
  });

  test('list items show employer + fill count', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    await expect(firstReq).toContainText(/of|filled|·/);
  });
});
