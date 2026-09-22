import { expect, test } from '@playwright/test';

test.describe('/shortlists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shortlists');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /shortlists/i, level: 1 })).toBeVisible();
  });

  test('description explains this is a per-requisition workflow', async ({ page }) => {
    await expect(page.getByText(/pick a requisition|per requisition|shortlist/i)).toBeVisible();
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

  test('picking a requisition opens its pipeline / shortlist view', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    if (!(await firstReq.isVisible().catch(() => false))) {
      test.skip(true, 'no requisitions');
      return;
    }
    await firstReq.click();
    await expect(page).toHaveURL(/\/requisitions\/[^/]+/);
  });

  test('status pills render on each requisition tile', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    if (await firstReq.isVisible().catch(() => false)) {
      await expect(firstReq).toContainText(
        /OPEN|DRAFT|FILLED|IN.PROGRESS|CLOSED|CANCELLED|PARTIALLY/i,
      );
    }
  });
});
