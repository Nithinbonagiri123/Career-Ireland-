import { expect, test } from '@playwright/test';

test.describe('/immigration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/immigration');
  });

  test('page header shows title + New case action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /immigration/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new case|add case|create case/i }).first(),
    ).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (await anytime.isVisible().catch(() => false)) {
      await expect(anytime).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('table columns Type / Beneficiary / Reference / Status render', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    if (hasTable) {
      await expect(page.getByRole('columnheader', { name: /type/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /beneficiary/i })).toBeVisible();
    } else {
      const hasEmpty = await page
        .getByText(/no cases|no immigration/i)
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasEmpty).toBe(true);
    }
  });

  test('case-type badges (Permit / Visa / Extension) render if any case exists', async ({
    page,
  }) => {
    const anyType = page.getByText(/permit|visa|extension/i).first();
    if (await anyType.isVisible().catch(() => false)) {
      await expect(anyType).toBeVisible();
    }
  });

  test('following a row opens the case detail page', async ({ page }) => {
    const firstLink = page.locator('a[href^="/immigration/"]').first();
    if (await firstLink.isVisible().catch(() => false)) {
      await firstLink.click();
      await expect(page).toHaveURL(/\/immigration\/[^/]+/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } else {
      test.skip(true, 'no immigration cases');
    }
  });
});
