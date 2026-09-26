import { expect, test } from '@playwright/test';

test.describe('/immigration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/immigration');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /immigration/i, level: 1 })).toBeVisible();
  });

  test('Open case button is present in the header action bar', async ({ page }) => {
    // Actual button label in immigration/page.tsx is "Open case".
    await expect(page.getByRole('button', { name: /^open case$/i })).toBeVisible();
  });

  test('My Cases / Global Cases tabs are present', async ({ page }) => {
    // Immigration uses CaseScopeTabs (spec §1: don't say 'All Cases' — use
    // 'Global Cases'). Both labels come from src/components/case-scope-tabs.tsx.
    await expect(page.getByRole('tab', { name: /my cases/i }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /global cases/i }).first()).toBeVisible();
  });

  test('card grid renders (with rows or empty-state fallback)', async ({ page }) => {
    // Immigration cases aren't in the minimal seed. Cards are the default view
    // (spec §11); the grid renders either at least one card heading (h3 with
    // the beneficiary name) or the specific card-grid empty state text.
    await page.waitForLoadState('networkidle');
    const anyCard = await page
      .locator('h3')
      .first()
      .isVisible()
      .catch(() => false);
    if (!anyCard) {
      await expect(page.getByText(/no immigration cases yet/i).first()).toBeVisible();
    }
  });

  test('clicking Open case opens the new-case dialog', async ({ page }) => {
    await page.getByRole('button', { name: /^open case$/i }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
  });
});
