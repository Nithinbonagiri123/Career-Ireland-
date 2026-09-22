import { expect, test } from '@playwright/test';

/**
 * Focused e2e tests for /requisitions. Five checks: header, grid view
 * default, table toggle, Add button, and Pipeline Wall on a requisition
 * detail if one exists. Complements smoke-all-routes.
 */

test.describe('/requisitions', () => {
  test('page header shows title + Add requisition action', async ({ page }) => {
    await page.goto('/requisitions');
    await expect(page.getByRole('heading', { name: /requisitions/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /add requisition|new requisition/i }),
    ).toBeVisible();
  });

  test('grid is the default view', async ({ page }) => {
    await page.goto('/requisitions');
    await expect(page.getByRole('link', { name: /^cards$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('table view renders the DataTable with a Title column', async ({ page }) => {
    await page.goto('/requisitions?view=table');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /title/i })).toBeVisible();
  });

  test('grid view renders a card (or empty state)', async ({ page }) => {
    await page.goto('/requisitions?view=grid');
    const anyCard = await page
      .locator('a[href^="/requisitions/"]')
      .filter({ has: page.locator('h3') })
      .first()
      .isVisible()
      .catch(() => false);
    const empty = await page
      .getByText(/no requisitions to display/i)
      .isVisible()
      .catch(() => false);
    expect(anyCard || empty).toBe(true);
  });

  test('opens the Pipeline Wall on a requisition detail if one exists', async ({ page }) => {
    await page.goto('/requisitions?view=grid');
    const firstCard = page.locator('a[href^="/requisitions/"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      const href = await firstCard.getAttribute('href');
      if (href) {
        await page.goto(href);
        // Pipeline Wall renders horizontal bands — Source is always first.
        await expect(page.getByText(/source|pipeline/i).first()).toBeVisible();
      }
    } else {
      // No requisitions seeded — nothing to test, mark as trivially passed.
      test.skip(true, 'no requisitions available');
    }
  });
});
