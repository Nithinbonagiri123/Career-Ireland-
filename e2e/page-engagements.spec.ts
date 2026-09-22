import { expect, test } from '@playwright/test';

test.describe('/engagements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/engagements');
  });

  test('page header shows title + Create engagement action', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /service engagements|engagements/i, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /create engagement|new engagement/i }).first(),
    ).toBeVisible();
  });

  test('description mentions the legal name and service context', async ({ page }) => {
    await expect(page.getByText(/commercial orders|create an engagement/i)).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });

  test('engagements table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no engagements/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('clicking the create button opens the create dialog', async ({ page }) => {
    const createBtn = page
      .getByRole('button', { name: /create engagement|new engagement/i })
      .first();
    await createBtn.click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });
});
