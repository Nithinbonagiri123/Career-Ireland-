import { expect, test } from '@playwright/test';

/**
 * Whole-app smoke suite.
 *
 * Every route in the app gets one "does it load without crashing" check.
 * Complementary to `list-pages.spec.ts` (which only covers list-index
 * routes); this one also hits the dashboards, workflow-specific pages,
 * detail-agnostic surfaces, admin sub-pages, and the /account pages.
 *
 * A route qualifies as a smoke test if:
 *   1. HTTP status is < 400 for the authenticated admin
 *   2. The document renders an <h1> or <main>
 *   3. No uncaught page errors were emitted
 *   4. No non-third-party console errors were emitted
 *
 * Detail routes (e.g. /candidates/[id]) are covered by the flow-specific
 * suites (candidate-onboarding, checklists-walk, billing-tab-walk).
 * Adding detail routes here would need a seeded fixture and would
 * duplicate what those specs already do.
 */

const ROUTES: Array<{ path: string; expectHeading?: RegExp }> = [
  // ── Dashboards ─────────────────────────────────────────────────────
  { path: '/dashboard', expectHeading: /— today|main dashboard|overview/i },
  { path: '/dashboard/candidate-services', expectHeading: /candidate services/i },
  { path: '/dashboard/recruitment', expectHeading: /recruitment/i },
  { path: '/dashboard/immigration', expectHeading: /immigration/i },

  // ── Pipeline / list index ──────────────────────────────────────────
  { path: '/candidates', expectHeading: /candidates/i },
  { path: '/candidates?view=grid', expectHeading: /candidates/i },
  { path: '/candidates?view=table', expectHeading: /candidates/i },
  { path: '/leads', expectHeading: /leads/i },
  { path: '/prospects', expectHeading: /prospects/i },
  { path: '/documents', expectHeading: /documents/i },
  { path: '/applications', expectHeading: /applications/i },

  // ── Demand ─────────────────────────────────────────────────────────
  { path: '/employers', expectHeading: /employers/i },
  { path: '/requisitions', expectHeading: /requisitions/i },
  { path: '/requisitions?view=grid', expectHeading: /requisitions/i },
  { path: '/requisitions?view=table', expectHeading: /requisitions/i },

  // ── Match & hire ───────────────────────────────────────────────────
  { path: '/matching', expectHeading: /matching/i },
  { path: '/shortlists', expectHeading: /shortlists/i },
  { path: '/interviews', expectHeading: /interviews/i },
  { path: '/placements', expectHeading: /placements/i },

  // ── Sourcing / immigration / activity ──────────────────────────────
  { path: '/campaigns', expectHeading: /campaigns/i },
  { path: '/immigration', expectHeading: /immigration/i },
  { path: '/tasks', expectHeading: /tasks/i },
  { path: '/communications', expectHeading: /communications/i },

  // ── Commerce ───────────────────────────────────────────────────────
  { path: '/engagements', expectHeading: /engagements/i },
  { path: '/payments', expectHeading: /payments/i },

  // ── Reports + notifications ────────────────────────────────────────
  { path: '/reports', expectHeading: /reports/i },
  { path: '/notifications', expectHeading: /notifications/i },

  // ── Admin ──────────────────────────────────────────────────────────
  { path: '/admin', expectHeading: /admin/i },
  { path: '/admin/settings', expectHeading: /settings|admin/i },

  // ── User-scoped ────────────────────────────────────────────────────
  { path: '/account/security', expectHeading: /security|account/i },
];

for (const route of ROUTES) {
  test(`smoke: ${route.path}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err));

    const response = await page.goto(route.path);
    expect(response?.status(), `${route.path} status`).toBeLessThan(400);

    if (route.expectHeading) {
      await expect(
        page.getByRole('heading', { name: route.expectHeading, level: 1 }).first(),
      ).toBeVisible();
    } else {
      await expect(page.locator('main')).toBeVisible();
    }

    expect(
      pageErrors.map((e) => e.message),
      `page errors on ${route.path}`,
    ).toEqual([]);
    const meaningful = consoleErrors.filter(
      (e) =>
        !/favicon|extension|net::ERR_|Download the React DevTools|Hydration failed|hydrated but some attributes/i.test(
          e,
        ),
    );
    expect(meaningful, `console errors on ${route.path}`).toEqual([]);
  });
}
