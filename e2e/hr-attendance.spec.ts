import { expect, test } from '@playwright/test';

/**
 * HR attendance happy path — clock in, verify the UI switches to
 * "clocked in" state and the row appears in the history, then clock
 * out. Runs as the seeded admin so it shares state with the rest of
 * the admin project.
 *
 * The DB-level constraint tests in
 * `src/modules/hr/attendance.test.ts` prove that concurrent inserts,
 * negative sessions, and double-close are refused. This spec covers
 * the user-visible flow only.
 */

test('admin can clock in and clock out from /hr', async ({ page }) => {
  await page.goto('/hr');

  // If a previous test left the admin clocked in, close that session
  // first so the assertions on the initial state are deterministic.
  const openClockOut = page.getByRole('button', { name: /clock out/i });
  if (await openClockOut.isVisible().catch(() => false)) {
    await openClockOut.click();
    await expect(page.getByRole('button', { name: /^clock in$/i })).toBeVisible({ timeout: 5_000 });
  }

  // Initial state: no active session.
  const clockIn = page.getByRole('button', { name: /^clock in$/i });
  await expect(clockIn).toBeVisible();
  await expect(page.getByText(/you're clocked in/i)).not.toBeVisible();

  await clockIn.click();

  // After the action resolves the panel flips to the active state.
  await expect(page.getByText(/you're clocked in/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /clock out/i })).toBeVisible();

  // History list should show today's session as active with a live dot.
  await expect(page.getByText(/active/i).first()).toBeVisible();

  // Clock out and confirm the panel resets.
  await page.getByRole('button', { name: /clock out/i }).click();
  await expect(page.getByRole('button', { name: /^clock in$/i })).toBeVisible({ timeout: 10_000 });
});
