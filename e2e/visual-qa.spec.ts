import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Headed visual sweep. Not part of the standard test suite — run
 * explicitly via `pnpm exec playwright test visual-qa.spec.ts
 * --headed --project=admin`. Dumps a full-page screenshot of every
 * internal route to `screenshots/` so I can inspect the actual
 * rendered state and catch visual regressions the assertions miss.
 */

const OUT_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const ROUTES: string[] = [
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

for (const route of ROUTES) {
  test(`screenshot ${route}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status(), `${route} status`).toBeLessThan(400);

    // Wait for the h1 so we know hydration has kicked in.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    // Small pause so animations settle before screenshot.
    await page.waitForTimeout(400);

    const filename = route.replace(/^\//, '').replace(/\//g, '__') || 'root';
    await page.screenshot({
      path: path.join(OUT_DIR, `${filename}.png`),
      fullPage: true,
    });

    // Write per-route diagnostics so I can grep later.
    fs.writeFileSync(
      path.join(OUT_DIR, `${filename}.log.json`),
      `${JSON.stringify(
        {
          route,
          status: response?.status(),
          consoleErrors: consoleErrors.filter((e) => !/favicon|extension|net::ERR_/i.test(e)),
          failedRequests,
        },
        null,
        2,
      )}\n`,
    );
  });
}
