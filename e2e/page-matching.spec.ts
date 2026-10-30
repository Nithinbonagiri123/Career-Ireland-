import { expect, test } from '@playwright/test';

// R5 — /matching is the global matching workspace (it used to be a job picker).
test.describe('/matching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/matching');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /matching/i, level: 1 })).toBeVisible();
  });

  test('filters and status tabs render', async ({ page }) => {
    // Stage 6G — the shared filter toolbar is a labelled region (no submit form).
    await expect(page.getByRole('region', { name: 'Filters' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Match status' })).toBeVisible();
  });

  test('match list or empty state renders', async ({ page }) => {
    const list = page.getByTestId('match-rows');
    const empty = page.getByText(/no matches here/i);
    await expect(list.or(empty).first()).toBeVisible();
  });
});
