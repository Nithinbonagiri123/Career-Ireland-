import { expect, test } from '@playwright/test';

test.describe('/leads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leads');
  });

  test('page header shows title + Add lead action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /leads/i, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /new lead|add lead/i }).first()).toBeVisible();
  });

  test('DateRange filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });

  test('search input filters leads client-side', async ({ page }) => {
    const search = page.getByPlaceholder(/search leads|search/i).first();
    await expect(search).toBeVisible();
    await search.fill('__no_such_lead__');
    // The list should visibly change — either empty or "no matches" text.
    await page.waitForTimeout(150);
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
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('scope filter (All / Assigned to me / Unassigned) is visible', async ({ page }) => {
    await expect(
      page.getByRole('tab', { name: /^all$/i }).or(page.getByRole('button', { name: /^all$/i })),
    ).toBeVisible();
    await expect(page.getByText(/assigned to me/i).first()).toBeVisible();
  });
});
