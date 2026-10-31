import { expect, test } from '@playwright/test';

/**
 * Payments: Verify / Reject stay ADMIN-only on this screen. A STAFF user who
 * can open /payments sees row menus without either item (and if STAFF has no
 * Payments access at all, nothing is shown).
 */
test('STAFF never sees Verify / Reject on /payments', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/payments?created=90d&status=pending', { waitUntil: 'networkidle' });
  const heading = page.getByRole('heading', { level: 1, name: /Payments/ });
  if (!(await heading.isVisible().catch(() => false))) {
    await expect(page.getByRole('menuitem', { name: /Verify|Reject/ })).toHaveCount(0);
    return;
  }
  const actions = page.getByTestId('payments-table').getByRole('button', { name: /^Actions for / });
  const n = Math.min(await actions.count(), 3);
  for (let i = 0; i < n; i++) {
    await actions.nth(i).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Verify/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Reject/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
});
