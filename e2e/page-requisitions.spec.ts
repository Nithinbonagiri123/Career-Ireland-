import { expect, test } from '@playwright/test';

test.describe('/requisitions', () => {
  test('page header shows title', async ({ page }) => {
    await page.goto('/requisitions');
    await expect(page.getByRole('heading', { name: /requisitions/i, level: 1 })).toBeVisible();
  });

  test('New requisition button is present', async ({ page }) => {
    await page.goto('/requisitions');
    await expect(page.getByRole('button', { name: /^new requisition$/i })).toBeVisible();
  });

  test('grid view is default and shows the Cards toggle pressed', async ({ page }) => {
    await page.goto('/requisitions');
    const grid = page.getByRole('link', { name: /^cards$/i });
    await expect(grid).toBeVisible();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
  });

  test('table view renders the DataTable with a Title column', async ({ page }) => {
    await page.goto('/requisitions?view=table');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /title/i })).toBeVisible();
  });

  test('grid view renders at least one requisition card (from the E2E seed)', async ({ page }) => {
    await page.goto('/requisitions?view=grid');
    // The card body is a <Card> (not a link) with the requisition title
    // in an h3. Seed inserts "E2E Fixture Junior Engineer".
    await expect(
      page.getByRole('heading', { level: 3, name: /E2E Fixture Junior Engineer/i }),
    ).toBeVisible();
  });
});
