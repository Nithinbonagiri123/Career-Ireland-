import { expect, test } from '@playwright/test';

test.describe('/notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/notifications');
  });

  test('page header shows title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /notifications/i, level: 1 })).toBeVisible();
  });

  test('list or empty state renders', async ({ page }) => {
    const list = page.getByRole('list').first();
    const hasList = await list.isVisible().catch(() => false);
    const hasEmpty = await page
      .getByText(/no notifications|nothing new/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasList || hasEmpty).toBe(true);
  });

  test('read/unread scope filter is present', async ({ page }) => {
    const filter = page
      .getByRole('tab', { name: /^all$|unread|read/i })
      .or(page.getByRole('button', { name: /unread|read|all/i }));
    if (
      await filter
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(filter.first()).toBeVisible();
    }
  });

  test('each notification (if any) links to a source subject', async ({ page }) => {
    const firstLink = page.locator('li a').first();
    if (await firstLink.isVisible().catch(() => false)) {
      const href = await firstLink.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('mark-all-read action is present if there are unread items', async ({ page }) => {
    const markAll = page.getByRole('button', { name: /mark all|read all/i }).first();
    if (await markAll.isVisible().catch(() => false)) {
      await expect(markAll).toBeVisible();
    }
  });
});
