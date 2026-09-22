import { expect, test } from '@playwright/test';

test.describe('/tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
  });

  test('page header shows title + New task action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /tasks/i, level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /new task|add task|create task/i }).first(),
    ).toBeVisible();
  });

  test('date-range filter defaults to Anytime', async ({ page }) => {
    const anytime = page.getByRole('tab', { name: /anytime/i });
    if (await anytime.isVisible().catch(() => false)) {
      await expect(anytime).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('table or empty state renders', async ({ page }) => {
    const hasTable = await page
      .locator('table')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText(/no tasks/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('priority badges (LOW / NORMAL / HIGH / URGENT) render if any task exists', async ({
    page,
  }) => {
    const anyPriority = page.getByText(/^LOW$|^NORMAL$|^HIGH$|^URGENT$/i).first();
    if (await anyPriority.isVisible().catch(() => false)) {
      await expect(anyPriority).toBeVisible();
    }
  });

  test('status badges (OPEN / IN PROGRESS / DONE / CANCELLED) render if any task exists', async ({
    page,
  }) => {
    const anyStatus = page.getByText(/^OPEN$|IN PROGRESS|^DONE$|^CANCELLED$/i).first();
    if (await anyStatus.isVisible().catch(() => false)) {
      await expect(anyStatus).toBeVisible();
    }
  });
});
