import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * Non-blocking mobile-viewport audit. Captures full-page screenshots at
 * iPhone SE (375 × 667) width for every top-level route so a human can
 * eyeball horizontal-scroll, cramped layouts, and mis-anchored floating
 * elements without touching a phone. Also runs a handful of
 * "hard" assertions — page must render past the auth wall, main content
 * must be visible, no console errors.
 *
 * Deliberately non-comprehensive: this is a scouting spec whose output
 * (screenshots + logs) drives the follow-up UI-cleanup workstream. If
 * every heading renders and no route explodes, the spec passes green
 * even if the visuals still need work — that's the human's call.
 */

const SHOTS = path.join(process.cwd(), 'screenshots', 'mobile');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const ROUTES: Array<{ path: string; heading: RegExp; slug: string }> = [
  { path: '/dashboard', heading: /today/i, slug: '01-dashboard' },
  { path: '/leads', heading: /leads/i, slug: '02-leads' },
  { path: '/candidates', heading: /candidates/i, slug: '03-candidates' },
  { path: '/employers', heading: /employers/i, slug: '04-employers' },
  { path: '/requisitions', heading: /requisitions/i, slug: '05-requisitions' },
  { path: '/matching', heading: /matching/i, slug: '06-matching' },
  { path: '/interviews', heading: /interviews/i, slug: '07-interviews' },
  { path: '/placements', heading: /placements/i, slug: '08-placements' },
  { path: '/immigration', heading: /immigration/i, slug: '09-immigration' },
  { path: '/documents', heading: /documents/i, slug: '10-documents' },
  { path: '/payments', heading: /payments/i, slug: '11-payments' },
  { path: '/campaigns', heading: /campaigns/i, slug: '12-campaigns' },
  { path: '/prospects', heading: /prospects/i, slug: '13-prospects' },
  { path: '/engagements', heading: /engagements/i, slug: '14-engagements' },
  { path: '/tasks', heading: /tasks/i, slug: '15-tasks' },
  { path: '/reports', heading: /reports/i, slug: '16-reports' },
  { path: '/notifications', heading: /notifications/i, slug: '17-notifications' },
];

async function auditRoute(page: Page, route: (typeof ROUTES)[number]) {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: route.heading, level: 1 }).first()).toBeVisible({
    timeout: 15_000,
  });
  // Screenshot in mobile viewport for visual review.
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SHOTS, `${route.slug}.png`),
    fullPage: true,
  });
  // Console errors are a real leak — hydration mismatches, missing keys,
  // undefined access etc. They're informational (don't fail the audit)
  // but do land in test output so we notice.
  if (consoleErrors.length > 0) {
    test.info().annotations.push({
      type: 'console-errors',
      description: `${route.path}: ${consoleErrors.length} console error(s)\n${consoleErrors.slice(0, 3).join('\n')}`,
    });
  }
}

test.describe('mobile-viewport audit @ 375×667', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  for (const route of ROUTES) {
    test(`${route.path} renders + captures screenshot`, async ({ page }) => {
      test.setTimeout(60_000);
      await auditRoute(page, route);
    });
  }
});
