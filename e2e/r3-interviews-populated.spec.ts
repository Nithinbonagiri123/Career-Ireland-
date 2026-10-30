import fs from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { seedInterviewOfferScenario } from './helpers/fixtures';

/**
 * R3 — populated Interviews & offers screens (job workspace tab and the
 * global Interviews list) at desktop, tablet and phone widths, from an
 * isolated fixture that is removed afterwards. Set REVIEW_SHOT_DIR to also
 * save review screenshots.
 */

const SIZES = [
  { name: 'desktop', width: 1440, height: 1000, shotHeight: 1500 },
  { name: 'tablet', width: 820, height: 1180, shotHeight: 1900 },
  { name: 'phone', width: 390, height: 844, shotHeight: 2600 },
] as const;
const SHOT_DIR = process.env.REVIEW_SHOT_DIR;

async function noSideScroll(page: Page, width: number) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(width);
}

async function pick(page: Page, group: string, label: RegExp) {
  const btn = page.getByRole('group', { name: group }).getByRole('button', { name: label });
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

test('populated interviews and offers render at every width', async ({ page }) => {
  test.setTimeout(240_000);
  const s = await seedInterviewOfferScenario();
  try {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });

      // ── Job workspace: Interviews & offers tab.
      await page.goto(`/requisitions/${s.jobId}?tab=interviews`, { waitUntil: 'networkidle' });
      const io = page.getByTestId('interviews-offers');
      await expect(io).toBeVisible({ timeout: 30_000 });
      const iRows = page.getByTestId('interview-rows').locator(':scope > li');
      const oRows = page.getByTestId('offer-rows').locator(':scope > li');

      // Defaults: "Needs result" (there is an overdue one) and "Open" offers.
      const ivGroup = page.getByRole('group', { name: 'Filter interviews' });
      const ofGroup = page.getByRole('group', { name: 'Filter offers' });
      await expect(ivGroup.getByRole('button', { name: /^Needs result/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      for (const b of await ivGroup.getByRole('button').all()) {
        await expect(b).toHaveAttribute('aria-pressed', /true|false/);
      }
      await expect(iRows).toHaveCount(s.counts.interviews.overdue);
      await expect(ofGroup.getByRole('button', { name: /^Open/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(oRows).toHaveCount(s.counts.offers.open);

      await pick(page, 'Filter interviews', /^Upcoming/);
      await expect(iRows).toHaveCount(s.counts.interviews.upcoming);
      await pick(page, 'Filter interviews', /^Completed/);
      await expect(iRows).toHaveCount(s.counts.interviews.completed);
      await pick(page, 'Filter interviews', /^Cancelled/);
      await expect(iRows).toHaveCount(s.counts.interviews.closed);
      await pick(page, 'Filter interviews', /^All/);
      await expect(iRows).toHaveCount(s.counts.interviews.all);
      await pick(page, 'Filter offers', /^Accepted/);
      await expect(oRows).toHaveCount(s.counts.offers.accepted);
      await pick(page, 'Filter offers', /^All/);
      await expect(oRows).toHaveCount(s.counts.offers.all);
      await noSideScroll(page, size.width);

      if (SHOT_DIR) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        await page.setViewportSize({ width: size.width, height: size.shotHeight });
        // Open one interview and one offer so expanded rows are visible.
        await iRows
          .filter({ hasText: /Aoife/ })
          .filter({ hasText: /Upcoming/ })
          .locator('summary')
          .click();
        await oRows.filter({ hasText: /Orla/ }).locator('summary').click();
        await page.getByTestId('interview-rows').scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOT_DIR}/job-interviews-populated-${size.name}.png` });
        await page.setViewportSize({ width: size.width, height: size.height });
      }

      // ── Global Interviews list, narrowed to this fixture.
      await page.goto(`/interviews?assigned=all&q=${s.tag}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: /interviews/i, level: 1 })).toBeVisible();
      for (const name of s.interviewStageNames) {
        await expect(page.getByText(name).first()).toBeVisible();
      }
      await noSideScroll(page, size.width);

      if (SHOT_DIR) {
        await page.setViewportSize({ width: size.width, height: size.shotHeight });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOT_DIR}/interviews-populated-${size.name}.png` });
      }
    }
  } finally {
    await s.cleanup();
    await s.cleanup(); // safe to call twice
    expect(await s.remaining()).toBe(0);
  }
});
