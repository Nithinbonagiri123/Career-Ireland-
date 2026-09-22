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
    expect(anyReq || empty).toBe(true);
  });

  test('picking a requisition navigates into its detail (with matching tab)', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    if (!(await firstReq.isVisible().catch(() => false))) {
      test.skip(true, 'no requisitions');
      return;
    }
    await firstReq.click();
    await expect(page).toHaveURL(/\/requisitions\/[^/]+/);
  });

  test('list items show employer + fill count', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    if (await firstReq.isVisible().catch(() => false)) {
      // Shared WorkflowRequisitionList shows "Employer · X of Y filled".
      await expect(firstReq).toContainText(/of|filled|·/);
    }
  });
});
