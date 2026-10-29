import { expect, test } from '@playwright/test';

/**
 * R5 — a STAFF user without recruitment.matching write access is offered no
 * matching or shortlist write controls (server refusal is unit-tested in
 * src/modules/matching/r5.test.ts).
 */
test('STAFF gets no matching or shortlist write controls', async ({ page }) => {
  for (const url of ['/matching', '/shortlists']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    for (const name of [/Run matching/, /^Shortlist$/, /^Dismiss$/, /Mark presented/, /^Remove$/]) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  }
});
