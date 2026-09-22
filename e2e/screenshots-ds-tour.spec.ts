import path from 'node:path';
import { expect, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');

const TOUR: Array<{ url: string; title: RegExp; slug: string }> = [
  { url: '/dashboard', title: /today/i, slug: 'dashboard' },
  { url: '/candidates', title: /^candidates/i, slug: 'candidates' },
  { url: '/leads', title: /^leads/i, slug: 'leads' },
  { url: '/employers', title: /^employers/i, slug: 'employers' },
  { url: '/requisitions', title: /job requisitions/i, slug: 'requisitions' },
  { url: '/immigration', title: /immigration/i, slug: 'immigration' },
  { url: '/placements', title: /placements/i, slug: 'placements' },
  { url: '/interviews', title: /interviews/i, slug: 'interviews' },
  { url: '/campaigns', title: /campaigns/i, slug: 'campaigns' },
  { url: '/tasks', title: /tasks/i, slug: 'tasks' },
];

for (const t of TOUR) {
  test(`ds tour · ${t.slug}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(t.url, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: t.title }).first()).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS, `e2e__ds-tour-${t.slug}.png`),
      fullPage: false,
    });
  });
}
