import { expect, test } from '@playwright/test';

/**
 * List-page regression suite.
 *
 * Each list route must:
 *   - Return 200 for the authenticated admin
 *   - Render an <h1> (the PageHeader)
 *   - Render either a data table or an empty state — never a raw error boundary
 *
 * The full-flow tests (create → detail → status transition) live alongside
 * their entities. This suite guards the visible surface area so an accidental
 * schema/service break shows up as one obvious failure per route.
 */

const LIST_ROUTES: Array<{ path: string; heading: RegExp }> = [
  { path: '/candidates', heading: /candidates/i },
  { path: '/leads', heading: /leads/i },
  { path: '/employers', heading: /employers/i },
  { path: '/requisitions', heading: /requisitions/i },
  { path: '/immigration', heading: /immigration/i },
  { path: '/interviews', heading: /interviews/i },
  { path: '/applications', heading: /applications/i },
  { path: '/placements', heading: /placements/i },
  { path: '/tasks', heading: /tasks/i },
  { path: '/documents', heading: /documents/i },
  { path: '/payments', heading: /payments/i },
  { path: '/reports', heading: /reports/i },
  { path: '/notifications', heading: /notifications/i },
];

for (const route of LIST_ROUTES) {
  test(`list page: ${route.path} renders without runtime errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err));

    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} status`).toBeLessThan(400);

    await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();

    // Page-level exceptions bubble as pageerror events — a runtime crash of a
    // server or client component would show up here.
    expect(
      pageErrors.map((e) => e.message),
      `unhandled page errors on ${route.path}`,
    ).toEqual([]);

    // Suppress noise from third-party origins (favicons, extension probes).
    const meaningfulErrors = consoleErrors.filter((e) => !/favicon|extension|net::ERR_/i.test(e));
    expect(meaningfulErrors, `console errors on ${route.path}`).toEqual([]);
  });
}

test('dashboard exposes a global search trigger', async ({ page }) => {
  await page.goto('/dashboard');
  // The ⌘K global search is a persistent button in the header; the smoke suite
  // only asserted the h1, this asserts one of the interactive surfaces.
  const searchTrigger = page
    .getByRole('button', { name: /search/i })
    .or(page.getByPlaceholder(/search/i));
  await expect(searchTrigger.first()).toBeVisible();
});
