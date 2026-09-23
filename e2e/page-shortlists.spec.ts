import { expect, test } from '@playwright/test';

test.describe('/shortlists', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shortlists');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /shortlists/i, level: 1 })).toBeVisible();
  });

  test('description explains the per-requisition workflow', async ({ page }) => {
    // Use exact substring to avoid strict-mode collision with the
    // matching emptyDescription line that also contains "shortlist".
    await expect(page.getByText(/curated per requisition from your matches/i)).toBeVisible();
  });

  test('requisition list renders (from the seed)', async ({ page }) => {
    // Minimal seed guarantees at least one requisition.
    await expect(page.locator('a[href^="/requisitions/"]').first()).toBeVisible();
  });

  test('picking a requisition opens its detail', async ({ page }) => {
    const firstReq = page.locator('a[href^="/requisitions/"]').first();
    await expect(firstReq).toBeVisible();
    await firstReq.click();
    await expect(page).toHaveURL(/\/requisitions\/[^/]+/);
  });

  test('page does not render an error boundary', async ({ page }) => {
    await expect(page.getByText(/something went wrong|error boundary/i)).toBeHidden();
  });
});
