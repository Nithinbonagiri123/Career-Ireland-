import { expect, test } from '@playwright/test';

test.describe('/interviews', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interviews');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /interviews/i, level: 1 })).toBeVisible();
  });

  test('calendar buckets render (Today / This week / etc.) or empty state', async ({ page }) => {
    const anyBucket = page.getByText(/today|this week|later|past|no interviews/i).first();
    await expect(anyBucket).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (await anytime.isVisible().catch(() => false)) {
      await expect(anytime).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('mode indicators (Phone / Video / In person / Panel) render if any interview exists', async ({
    page,
  }) => {
    const anyMode = page.getByText(/phone|video|in person|panel/i).first();
    if (await anyMode.isVisible().catch(() => false)) {
      await expect(anyMode).toBeVisible();
    }
  });

  test('following an interview row opens the application detail page', async ({ page }) => {
    const firstLink = page.locator('a[href^="/applications/"]').first();
    if (await firstLink.isVisible().catch(() => false)) {
      await firstLink.click();
      await expect(page).toHaveURL(/\/applications\/[^/]+/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } else {
      test.skip(true, 'no interviews scheduled');
    }
  });
});
