import { expect, test } from '@playwright/test';

/**
 * HR attendance happy path — clock in, take a break, end the break,
 * clock out. Exercises the Today card's three states (Off / Working /
 * On break) and the state transitions between them.
 *
 * The DB-level constraint tests in
 * `src/modules/hr/attendance.test.ts` prove that concurrent inserts,
 * negative sessions, double-close, and double-open-break are refused.
 * This spec covers the user-visible flow only.
 */

test('admin can clock in, take a break, and clock out from /hr', async ({ page }) => {
  await page.goto('/hr');

  // Session 19 added a ClockWidget to the global top bar, so there are
  // now two "Clock in" / "Clock out" controls on /hr: one in the <header>
  // (top bar) and one in the <main> (ClockPanel). Scope every assertion
  // to <main> so the test ignores the global widget.
  const panel = page.locator('main');

  // If a previous test left the admin mid-session, wind it back so the
  // assertions on the initial state are deterministic. We might be in
  // Working OR On break — end break first if present, then clock out.
  const endBreak = panel.getByRole('button', { name: /^end break$/i });
  if (await endBreak.isVisible().catch(() => false)) {
    await endBreak.click();
    await expect(panel.getByRole('button', { name: /^start break$/i })).toBeVisible({
      timeout: 5_000,
    });
  }
  const openClockOut = panel.getByRole('button', { name: /^clock out$/i });
  if (await openClockOut.isVisible().catch(() => false)) {
    await openClockOut.click();
    await expect(panel.getByRole('button', { name: /^clock in$/i })).toBeVisible({
      timeout: 5_000,
    });
  }

  // Initial state: Off the clock, only the Clock in button is visible.
  const clockIn = panel.getByRole('button', { name: /^clock in$/i });
  await expect(clockIn).toBeVisible();
  await expect(panel.getByText(/off the clock/i)).toBeVisible();

  // Clock in → panel flips to Working.
  await clockIn.click();
  await expect(panel.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByRole('button', { name: /^start break$/i })).toBeVisible();

  // Start a break → panel flips to On break.
  await panel.getByRole('button', { name: /^start break$/i }).click();
  await expect(panel.getByText(/^on break$/i)).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByRole('button', { name: /^end break$/i })).toBeVisible();

  // End the break → back to Working.
  await panel.getByRole('button', { name: /^end break$/i }).click();
  await expect(panel.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });

  // Clock out → back to Off the clock.
  await panel.getByRole('button', { name: /^clock out$/i }).click();
  await expect(panel.getByRole('button', { name: /^clock in$/i })).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText(/off the clock/i)).toBeVisible();
});
