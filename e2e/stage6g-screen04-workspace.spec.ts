import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 04 — Candidate Profile Workspace visual acceptance.
 * Finds the first candidate in /candidates?assigned=all and screenshots
 * their workspace at 1440 / 820 / 390 so the owner can compare with the
 * approved mockup (04_Candidate_Profile_Workspace_APPROVED.png).
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-screen04-workspace');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

test('stage 6G Screen 04 — Candidate workspace screenshots', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);

  // Pick a candidate id from the list first — the URL is /clients/<personId>.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/candidates?assigned=all');
  await expect(page.getByRole('heading', { name: /^Candidates$/i })).toBeVisible({
    timeout: 15_000,
  });
  const openWorkspaceLink = page.getByRole('link', { name: /open profile/i }).first();
  await expect(openWorkspaceLink).toBeVisible({ timeout: 10_000 });
  const href = await openWorkspaceLink.getAttribute('href');
  if (!href) throw new Error('No candidate workspace link found');

  // Force the Overview tab so the Personal + Professional cards render
  // on the screenshot. The "Open workspace" link routes to ?tab=applications
  // by default which hides the restyled Overview grid.
  const url = href.includes('?') ? `${href.split('?')[0]}?tab=overview` : `${href}?tab=overview`;
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 820, height: 1180 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    // Wait for the person's name heading to render — it's the h1.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `${label}-${stamp}.png`),
      fullPage: true,
    });
  }
});
