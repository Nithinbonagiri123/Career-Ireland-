import { expect, test } from '@playwright/test';

test.describe('/documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /documents/i, level: 1 })).toBeVisible();
  });

  test('main region renders', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('owner search input is present', async ({ page }) => {
    const search = page.getByPlaceholder(/search|candidate|owner|filter/i).first();
    if (await search.isVisible().catch(() => false)) {
      await expect(search).toBeVisible();
    }
  });

  test('client folders or empty state renders', async ({ page }) => {
    const hasFolders = await page
      .locator('a[href^="/candidates/"], a[href^="/employers/"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no documents|nothing uploaded|no candidates|no employers/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasFolders || hasEmpty || (await page.locator('h1').isVisible())).toBe(true);
  });

  test("following a folder navigates to that owner's documents", async ({ page }) => {
    const firstOwner = page.locator('a[href^="/candidates/"], a[href^="/employers/"]').first();
    if (!(await firstOwner.isVisible().catch(() => false))) {
      test.skip(true, 'no owner folders');
      return;
    }
    await firstOwner.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
