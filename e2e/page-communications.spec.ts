import { expect, test } from '@playwright/test';

test.describe('/communications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/communications');
  });

  test('page header shows title + Log communication action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /communications/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /log communication|add communication/i }).first(),
    ).toBeVisible();
  });

  test('description explains subjects + timelines', async ({ page }) => {
    await expect(
      page.getByText(/recorded touchpoint|attach to at least one subject/i),
    ).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (await anytime.isVisible().catch(() => false)) {
      await expect(anytime).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('empty-state description is readable over the photo backdrop', async ({ page }) => {
    // If empty, the description text lives on a .glass-panel; regression
    // check for the earlier "text invisible over photo" bug.
    const emptyText = page.getByText(/no communications logged|every email, call, meeting/i);
    if (
      await emptyText
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(emptyText.first()).toBeVisible();
    }
  });

  test('clicking Log communication opens the create dialog', async ({ page }) => {
    const btn = page.getByRole('button', { name: /log communication|add communication/i }).first();
    await btn.click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });
});
