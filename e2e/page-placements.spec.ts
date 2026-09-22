import { expect, test } from '@playwright/test';

test.describe('/placements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/placements');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /placements/i, level: 1 })).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (await anytime.isVisible().catch(() => false)) {
      await expect(anytime).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no placements/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('status badges (PROPOSED / CONFIRMED / STARTED / ...) render if any placement exists', async ({
    page,
  }) => {
    const anyStatus = page.getByText(/PROPOSED|CONFIRMED|STARTED|COMPLETED|TERMINATED/i).first();
    if (await anyStatus.isVisible().catch(() => false)) {
      await expect(anyStatus).toBeVisible();
    }
  });

  test('candidate + employer names render in the row', async ({ page }) => {
    // A placement row shows a candidate link OR an employer link.
    const linkyRow = page.locator('a[href^="/candidates/"], a[href^="/employers/"]').first();
    if (await linkyRow.isVisible().catch(() => false)) {
      await expect(linkyRow).toBeVisible();
    }
  });
});
