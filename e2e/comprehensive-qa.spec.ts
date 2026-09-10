import { expect, test } from '@playwright/test';

/**
 * End-to-end QA sweep across every internal route. Adds coverage the
 * existing smoke/list-pages suites don't hit:
 *
 *   - Every dashboard sub-page (/dashboard/*)
 *   - Every admin page (/admin/*)
 *   - HR pages (/hr, /hr/team, /hr/admin)
 *   - Recruitment lists (/campaigns, /prospects, /matching, /shortlists,
 *     /engagements)
 *
 * For each: HTTP status < 400, an <h1> is visible, no unhandled page
 * errors, no meaningful console errors.
 *
 * A dedicated block reproduces the sidebar scroll bug: scroll the
 * sidebar to the bottom, click a bottom item, assert the workspace
 * content area is scrolled to the top of the new page and the newly
 * active nav item is visible in the sidebar viewport.
 */

const ALL_ROUTES: string[] = [
  '/dashboard',
  '/dashboard/candidate-services',
  '/dashboard/recruitment',
  '/dashboard/immigration',
  '/candidates',
  '/candidates/new',
  '/leads',
  '/employers',
  '/requisitions',
  '/campaigns',
  '/prospects',
  '/matching',
  '/shortlists',
  '/interviews',
  '/applications',
  '/placements',
  '/engagements',
  '/immigration',
  '/documents',
  '/payments',
  '/communications',
  '/tasks',
  '/notifications',
  '/reports',
  '/hr',
  '/hr/team',
  '/hr/admin',
  '/admin/users',
  '/admin/persons',
  '/admin/occupations',
  '/admin/skills',
  '/admin/qualifications',
  '/admin/document-types',
  '/admin/document-rules',
  '/admin/services',
  '/admin/currencies',
  '/admin/audit',
  '/account/security',
];

for (const path of ALL_ROUTES) {
  test(`route: ${path} renders cleanly`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err));

    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBeLessThan(400);

    // Some deep pages (candidate onboarding wizard step 1) may render
    // an <h1> after client hydration — a short wait is enough.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    expect(
      pageErrors.map((e) => e.message),
      `unhandled page errors on ${path}`,
    ).toEqual([]);

    // Note: we deliberately do NOT filter out "hydration" errors — a
    // hydration mismatch is a real regression signal (attribute merge
    // order, non-deterministic props, SSR/CSR divergence) and must
    // fail the sweep.
    const meaningful = consoleErrors.filter((e) => !/favicon|extension|net::ERR_/i.test(e));
    expect(meaningful, `console errors on ${path}`).toEqual([]);
  });
}

test('sidebar navigation: main content scroll resets on route change', async ({ page }) => {
  // Use the dashboard as the starting point — it's guaranteed to have
  // enough content to scroll (KPIs + trends + pipelines + activity).
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Wait for the trend charts / funnels to have laid out.
  await page.waitForLoadState('networkidle');

  const main = page.locator('main');

  // Only assert scroll reset if the page is actually tall enough to
  // scroll. On a very small viewport this should always be true; if
  // the fixture data ever shrinks below one screen, we surface that
  // as a skip so this test doesn't false-positive.
  const scrollable = await main.evaluate((el) => el.scrollHeight > el.clientHeight + 50);
  test.skip(!scrollable, 'dashboard fits in one viewport — nothing to scroll');

  await main.evaluate((el) => el.scrollTo(0, 300));
  const before = await main.evaluate((el) => el.scrollTop);
  expect(before, 'main should be scrolled down before navigation').toBeGreaterThan(100);

  // Click a sidebar item — /leads is under Candidate Services.
  await page.getByRole('link', { name: /^Leads$/ }).click();
  await expect(page).toHaveURL(/\/leads/);

  const after = await page.locator('main').evaluate((el) => el.scrollTop);
  expect(after, 'main should scroll back to top after sidebar navigation').toBe(0);
});

test('sidebar: clicking a bottom item keeps that item visible in the sidebar viewport', async ({
  page,
}) => {
  await page.goto('/dashboard');
  const sidebarNav = page.locator('aside nav');
  await expect(sidebarNav).toBeVisible();

  // Scroll the sidebar's own container to the bottom.
  await sidebarNav.evaluate((el) => el.scrollTo(0, el.scrollHeight));

  // Click a link that is expected to sit near the bottom (Audit Log is
  // the last item in the Admin section).
  const auditLink = page.getByRole('link', { name: /Audit Log/i });
  await auditLink.click();
  await expect(page).toHaveURL(/\/admin\/audit/);

  // The active nav item should be within the sidebar's own scroll box.
  const active = page.locator('aside nav [data-nav-active="true"]');
  await expect(active).toBeVisible();

  const visible = await active.evaluate((el) => {
    const nav = el.closest('nav') as HTMLElement | null;
    if (!nav) return false;
    const navRect = nav.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    return itemRect.top >= navRect.top && itemRect.bottom <= navRect.bottom;
  });
  expect(visible, 'active sidebar item stays visible after bottom-item click').toBe(true);
});
