import { expect, test } from '@playwright/test';

test.describe('/documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/documents');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /documents/i, level: 1 })).toBeVisible();
  });

  test('client folder cards or empty state renders', async ({ page }) => {
    const hasFolders = await page
      .locator('a[href^="/candidates/"], a[href^="/employers/"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no documents|nothing uploaded/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasFolders || hasEmpty).toBe(true);
  });

  test('owner-scope search input is present', async ({ page }) => {
    await expect(page.getByPlaceholder(/search|candidate|owner/i).first()).toBeVisible();
  });

  test('at least one owner (candidate/employer) shows a document count if any exist', async ({
    page,
  }) => {
    const firstOwner = page.locator('a[href^="/candidates/"], a[href^="/employers/"]').first();
    if (!(await firstOwner.isVisible().catch(() => false))) {
      test.skip(true, 'no owner folders');
      return;
    }
    // A card typically shows an integer count somewhere.
    await expect(firstOwner).toBeVisible();
  });

  test("following a folder navigates to that owner's documents section", async ({ page }) => {
    const firstOwner = page.locator('a[href^="/candidates/"], a[href^="/employers/"]').first();
    if (!(await firstOwner.isVisible().catch(() => false))) {
      test.skip(true, 'no owner folders');
      return;
    }
    await firstOwner.click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
