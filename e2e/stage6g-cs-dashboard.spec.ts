import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G — Candidate Services Dashboard visual acceptance: KPI tiles,
 * the revenue card (service mix donut + daily trend + granularity
 * toggle), recent activity and top services.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-cs-dashboard');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('stage 6G — Candidate Services dashboard screenshots', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);

  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto('/dashboard/candidate-services');
    await expect(page.getByRole('heading', { name: /Candidate Services Dashboard/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Revenue this month/i).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${label}-${stamp}.png`), fullPage: true });
  }
});
