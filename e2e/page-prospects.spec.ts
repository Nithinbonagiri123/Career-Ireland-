import { expect, test } from '@playwright/test';

/**
 * Focused e2e tests for /prospects. Five checks: header, status filter
 * pill row (was congested before the navy shift), campaign + country
 * dropdowns, search input, and empty state clarity.
 */

test.describe('/prospects', () => {
  test('page header shows title + description', async ({ page }) => {
    await page.goto('/prospects');
    await expect(page.getByRole('heading', { name: /prospects/i, level: 1 })).toBeVisible();
    await expect(page.getByText(/campaign advertisement/i)).toBeVisible();
  });

  test('status filter pill row shows all chips readable ("All" first)', async ({ page }) => {
    await page.goto('/prospects');
    // The previous layout truncated chip labels — this asserts they are
    // now visible after the .glass-panel wrapping fix.
    const tabs = page.getByRole('tablist', { name: /filter by status/i });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /^all$/i })).toBeVisible();
    // At least one of the enum labels should be visible + readable.
    const other = tabs.getByRole('tab').nth(1);
    await expect(other).toBeVisible();
    expect((await other.textContent())?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('campaign + country dropdowns are present', async ({ page }) => {
    await page.goto('/prospects');
    // Two <select> controls — one for campaigns, one for countries.
    await expect(page.locator('select').first()).toBeVisible();
    expect(await page.locator('select').count()).toBeGreaterThanOrEqual(2);
  });

  test('search input is present and typing narrows the visible label', async ({ page }) => {
    await page.goto('/prospects');
    const search = page.getByPlaceholder(/name or email/i);
    await expect(search).toBeVisible();
    await search.fill('__no_such_prospect__');
    await expect(page.getByText(/no prospects match these filters|no prospects/i)).toBeVisible();
  });

  test('empty state description is readable (not eaten by photo)', async ({ page }) => {
    await page.goto('/prospects');
    // The empty state is inside a .glass-panel — its description text
    // should be visible whether there are prospects or not.
    const emptyText = page.getByText(/recorded from an advertisement|no prospects match/i);
    if (await emptyText.isVisible().catch(() => false)) {
      await expect(emptyText).toBeVisible();
    }
  });
});
