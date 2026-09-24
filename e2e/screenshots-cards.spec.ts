import path from 'node:path';
import { expect, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');

/**
 * Screenshot spec for the two new card layouts:
 *   1. /requisitions (card grid, default) — vacancy tiles with counters
 *   2. /requisitions/[id] Shortlist tab — Kanban-style candidate cards
 *
 * Meant as a manual review artefact — the assertions are minimal and
 * intentionally forgiving. If either page renders the (app) error
 * boundary we catch it and dump the HTML so the failure is unambiguous.
 */

test('requisitions grid view renders vacancy tiles', async ({ page }) => {
  await page.goto('/requisitions?view=grid', { waitUntil: 'networkidle' });
  const errorTitle = page.getByRole('heading', { name: /something went wrong/i });
  if (await errorTitle.isVisible().catch(() => false)) {
    throw new Error(`/requisitions crashed:\n${await page.content()}`);
  }
  await expect(page.getByRole('heading', { name: /job requisitions/i }).first()).toBeVisible();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__requisitions-grid.png'),
    fullPage: true,
  });
});

test('requisitions table view still works via ?view=table', async ({ page }) => {
  await page.goto('/requisitions?view=table', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /job requisitions/i }).first()).toBeVisible();
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__requisitions-table.png'),
    fullPage: false,
  });
});

test('requisition detail Pipeline tab shows the horizontal bands', async ({ page }) => {
  // The old Shortlist tab was replaced by the Pipeline Wall in the
  // design refresh (see commit 5adbbf2). Now the requisition detail
  // has 3 tabs: Pipeline (default), Overview, Checklists. This test
  // screenshots the Pipeline tab's horizontal-band layout instead.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/requisitions?view=grid', { waitUntil: 'networkidle' });

  // Grid card footer has a "manage" link into the detail page.
  const firstManage = page.getByRole('link', { name: /^manage$/i }).first();
  await expect(firstManage).toBeVisible({ timeout: 10_000 });
  await firstManage.click();
  await page.waitForURL(/\/requisitions\/[0-9a-f-]+/i);
  await page.waitForLoadState('networkidle');

  // Pipeline is the default tab — the stepper strip should be visible
  // showing the stages (Source / Review / Shortlist / Apply / …).
  await expect(page.getByText(/source/i).first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__requisition-pipeline-wall.png'),
    fullPage: true,
  });
});
