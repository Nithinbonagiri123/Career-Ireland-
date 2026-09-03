import { expect, test } from '@playwright/test';

/**
 * Smoke suite — proves the harness works end-to-end:
 * - Playwright can boot the app (or reuse an existing dev server)
 * - The stored session cookie authenticates the admin user
 * - Core routes render server-side without errors
 */

test('dashboard renders for authenticated admin', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);

  // A page-header should be visible somewhere on the page.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // No hard console errors.
  expect(consoleErrors.filter((e) => !e.includes('favicon'))).toEqual([]);
});

test('every top-level route returns 200', async ({ page }) => {
  const routes = [
    '/dashboard',
    '/candidates',
    '/leads',
    '/employers',
    '/requisitions',
    '/immigration',
    '/interviews',
    '/applications',
    '/placements',
    '/tasks',
    '/documents',
    '/payments',
    '/reports',
    '/notifications',
    '/communications',
  ];

  const failed: Array<{ route: string; status: number }> = [];
  for (const route of routes) {
    const response = await page.goto(route);
    const status = response?.status() ?? 0;
    if (status >= 400) failed.push({ route, status });
  }
  expect(failed, `Routes that returned >=400:\n${JSON.stringify(failed, null, 2)}`).toEqual([]);
});
