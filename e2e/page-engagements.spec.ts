import { expect, test } from '@playwright/test';

test.describe('/engagements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/engagements');
  });

  test('page header shows title + Start service action', async ({ page }) => {
    // The /engagements route renders the Services page (the DB term is
    // "engagement" but the user-facing term is "service").
    await expect(page.getByRole('heading', { name: /^services$/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /start service|create engagement|new engagement/i }).first(),
    ).toBeVisible();
  });

  test('description mentions services + money', async ({ page }) => {
    await expect(page.getByText(/is delivering, with the money tied/i)).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    await expect(anytime).toBeVisible();
    await expect(anytime).toHaveAttribute('aria-selected', 'true');
  });

  test('services table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no engagements|no services/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('clicking the create button opens the create dialog', async ({ page }) => {
    const createBtn = page
      .getByRole('button', { name: /start service|create engagement|new engagement/i })
      .first();
    await createBtn.click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });
});
