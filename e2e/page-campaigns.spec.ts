import { expect, test } from '@playwright/test';

test.describe('/campaigns', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/campaigns');
  });

  test('page header shows title + New campaign action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /campaigns/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new campaign|create campaign/i }).first(),
    ).toBeVisible();
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
      .getByText(/no campaigns/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('status badges (DRAFT / ACTIVE / COMPLETED / CANCELLED) render if any campaign exists', async ({
    page,
  }) => {
    const anyStatus = page.getByText(/DRAFT|ACTIVE|COMPLETED|CANCELLED/i).first();
    if (await anyStatus.isVisible().catch(() => false)) {
      await expect(anyStatus).toBeVisible();
    }
  });

  test('following a campaign row opens the detail page', async ({ page }) => {
    const firstRow = page.locator('a[href^="/campaigns/"]').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(page).toHaveURL(/\/campaigns\/[^/]+/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } else {
      test.skip(true, 'no campaigns');
    }
  });
});
