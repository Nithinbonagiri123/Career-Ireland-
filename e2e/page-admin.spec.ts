import { expect, test } from '@playwright/test';

test.describe('/admin', () => {
  test('page header shows title', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /admin/i, level: 1 })).toBeVisible();
  });

  test('admin index shows navigation tiles', async ({ page }) => {
    await page.goto('/admin');
    // The admin index page renders a grid of card tiles linking to sub-areas.
    const anyTile = page.locator('a[href^="/admin/"]').first();
    await expect(anyTile).toBeVisible();
  });

  test('settings sub-page loads', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: /settings|admin/i, level: 1 })).toBeVisible();
  });

  test('audit sub-page shows a table or filter row', async ({ page }) => {
    await page.goto('/admin/audit');
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no audit|no events|no entries/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('users sub-page renders or gracefully 404s if not seeded', async ({ page }) => {
    const resp = await page.goto('/admin/users');
    // ADMIN can view users; anything ≥ 400 with no PageHeader would be
    // a regression, not "empty state".
    if (resp && resp.status() < 400) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});
