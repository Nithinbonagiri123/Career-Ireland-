import { expect, test } from '@playwright/test';
import { seedOpenJob } from './helpers/fixtures';

/**
 * Stage 6G workspace tabs on phones: the strip may scroll sideways, but the
 * selected tab must be in view (also for deep links), keyboard arrows move
 * between tabs, and the page itself never scrolls sideways.
 */
test.describe('workspace tabs on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('job: deep-linked last tab is visible; arrows move focus', async ({ page }) => {
    const job = await seedOpenJob();
    try {
      await page.goto(`/requisitions/${job.jobId}?tab=activity`, { waitUntil: 'networkidle' });
      const active = page.getByRole('tab', { name: /^Activity/ });
      await expect(active).toHaveAttribute('aria-selected', 'true');
      await expect
        .poll(async () => {
          const b = await active.boundingBox();
          return Boolean(b && b.x >= 0 && b.x + b.width <= 390);
        })
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );

      await page.getByRole('tab', { name: /^Pipeline/ }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: /^Overview/ })).toBeFocused();
    } finally {
      await job.cleanup();
    }
  });

  test('employer: deep-linked Activity tab is visible', async ({ page }) => {
    const job = await seedOpenJob();
    try {
      await page.goto(`/employers/${job.employerId}?tab=activity`, { waitUntil: 'networkidle' });
      const active = page.getByRole('tab', { name: 'Activity' });
      await expect(active).toHaveAttribute('aria-selected', 'true');
      await expect
        .poll(async () => {
          const b = await active.boundingBox();
          return Boolean(b && b.x >= 0 && b.x + b.width <= 390);
        })
        .toBe(true);
    } finally {
      await job.cleanup();
    }
  });
});
