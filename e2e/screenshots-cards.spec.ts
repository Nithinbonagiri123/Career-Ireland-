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

test('requisition detail Shortlist tab shows the card view', async ({ page }) => {
  // Land on the first requisition. If its shortlist is empty, hop over
  // to Matches and shortlist the top-scoring row so the card grid has
  // real data for the screenshot.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/requisitions', { waitUntil: 'networkidle' });
  const firstManage = page.getByRole('link', { name: /^manage$/i }).first();
  if (!(await firstManage.isVisible().catch(() => false))) {
    test.skip(true, 'No requisitions in this environment — nothing to screenshot');
  }
  await firstManage.click();
  await page.waitForURL(/\/requisitions\/[0-9a-f-]+/i);
  await page.waitForLoadState('networkidle');

  const shortlistTab = page.getByRole('tab', { name: /shortlist/i });
  await expect(shortlistTab).toBeVisible({ timeout: 15_000 });
  await shortlistTab.click();
  await page.waitForSelector('text=/candidate.*shortlisted|No shortlisted candidates yet/i', {
    timeout: 15_000,
  });

  // Bootstrap a shortlist entry if none exists.
  const emptyState = page.getByText(/no shortlisted candidates yet/i);
  if (await emptyState.isVisible().catch(() => false)) {
    await page.getByRole('tab', { name: /matches/i }).click();
    const firstShortlistBtn = page.getByRole('button', { name: /^shortlist$/i }).first();
    await expect(firstShortlistBtn).toBeVisible({ timeout: 15_000 });
    await firstShortlistBtn.click();
    await page.waitForTimeout(1200);
    await shortlistTab.click();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=/1 candidate.*shortlisted/i', { timeout: 15_000 });
  }

  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SHOTS, 'e2e__requisition-shortlist-cards.png'),
    fullPage: true,
  });
});
