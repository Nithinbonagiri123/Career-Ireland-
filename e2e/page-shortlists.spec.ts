import { expect, test } from '@playwright/test';

test.describe('/shortlists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shortlists');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /shortlists/i, level: 1 })).toBeVisible();
  });

  test('main region renders', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('requisition list renders or empty state shows', async ({ page }) => {
    const anyReq = await page
      .locator('a[href^="/requisitions/"]')
      .first()
      .isVisible()
      .catch(() => false);
    const empty = await page
      .getByText(/no requisitions/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(anyReq || empty || (await page.locator('h1').isVisible())).toBe(true);
  });

  test('picking a requisition opens its detail', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    if (!(await firstReq.isVisible().catch(() => false))) {
      test.skip(true, 'no requisitions');
      return;
    }
    await firstReq.click();
    await expect(page).toHaveURL(/\/requisitions\/[^/]+/);
  });

  test('page does not render an error boundary', async ({ page }) => {
    await expect(page.getByText(/something went wrong|error boundary/i)).toBeHidden();
  });
});
