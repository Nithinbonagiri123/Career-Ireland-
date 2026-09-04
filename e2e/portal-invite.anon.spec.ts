import { expect, test } from '@playwright/test';

/**
 * Portal invite acceptance page is one of the very few *public* server-rendered
 * routes. Test its two "invitation is not valid" branches:
 *  - Token doesn't exist  → "Invitation link not found."
 *  - Token is malformed   → same friendly UI (no 500)
 * A valid-token happy-path test would need DB seeding of a real invitation and
 * is out of scope for the anonymous suite.
 */

test('unknown invite token renders a friendly "not found" card, not a 500', async ({ page }) => {
  const response = await page.goto('/portal/invite/does-not-exist-token-xxxxxxxxxxxxxxxxxxxxxxxx');
  expect(response?.status()).toBe(200);
  await expect(page.getByText(/invitation link not found/i)).toBeVisible();
});

test('very short/garbage invite token also renders the not-valid card', async ({ page }) => {
  const response = await page.goto('/portal/invite/xyz');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByText(/invitation is not valid|invitation link not found/i).first(),
  ).toBeVisible();
});
