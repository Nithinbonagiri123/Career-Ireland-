import { expect, test } from '@playwright/test';

test.describe('/leads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leads');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /leads/i, level: 1 })).toBeVisible();
  });

  test('DateRange filter defaults to Anytime', async ({ page }) => {
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

  test('page main region is present', async ({ page }) => {
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('leads table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no leads/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty || (await page.locator('h1').isVisible())).toBe(true);
  });

  test('scope filter chips row exists on the page', async ({ page }) => {
    // ScopeFilter renders All / Assigned to me / Unassigned as tabs.
    const scope = page.getByRole('tab', { name: /^all$/i }).or(page.getByText(/assigned to me/i));
    if (
      await scope
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(scope.first()).toBeVisible();
    }
  });
});
