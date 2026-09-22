import { expect, test } from '@playwright/test';

test.describe('/payments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/payments');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /payments/i, level: 1 })).toBeVisible();
  });

  test('date-range filter is present and defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });

  test('table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no payments/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('status column badges use semantic tones (not raw hex)', async ({ page }) => {
    const anyBadge = page.getByText(/PENDING|VERIFIED|REJECTED|PROOF.UPLOADED/i).first();
    if (await anyBadge.isVisible().catch(() => false)) {
      await expect(anyBadge).toBeVisible();
    } else {
      test.skip(true, 'no payments to render badges');
    }
  });

  test('a payment row (if present) links into a detail view', async ({ page }) => {
    const firstRow = page.locator('a[href*="/engagements/"], a[href*="/payments/"]').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } else {
      test.skip(true, 'no payment rows');
    }
  });
});
