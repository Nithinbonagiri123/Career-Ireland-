import { expect, test } from '@playwright/test';

test.describe('/interviews', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interviews');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /interviews/i, level: 1 })).toBeVisible();
  });

  test('shows either candidates at Interview stage or the empty state', async ({ page }) => {
    const anyRow = page
      .getByText(/nobody at the interview stage right now|moved to interview/i)
      .first();
    await expect(anyRow).toBeVisible();
  });
});
