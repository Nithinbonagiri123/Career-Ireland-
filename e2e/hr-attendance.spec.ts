import { expect, test } from '@playwright/test';
import { withIsolatedUser } from './helpers/isolated-user';

/**
 * HR attendance happy path — clock in, take a break, end the break,
 * clock out. Exercises the Today card's three states (Off / Working /
 * On break) and the state transitions between them.
 *
 * R6 — runs as a fresh throwaway user so the once-per-calendar-day
 * clock-in rule never trips on a session from an earlier run (the rule
 * itself is unchanged). DB-level constraint tests live in
 * `src/modules/hr/attendance.test.ts`.
 */
test('a staff member can clock in, take a break, and clock out from /hr', async ({ browser }) => {
  test.setTimeout(120_000);
  await withIsolatedUser(browser, async (page) => {
    await page.goto('/hr');
    // Scope to <main>: the global top bar has its own Clock in / out widget.
    const panel = page.locator('main');

    const clockIn = panel.getByRole('button', { name: /^clock in$/i });
    await expect(clockIn).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(/off the clock/i)).toBeVisible();

    await clockIn.click();
    await expect(panel.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole('button', { name: /^start break$/i })).toBeVisible();

    await panel.getByRole('button', { name: /^start break$/i }).click();
    await expect(panel.getByText(/^on break$/i)).toBeVisible({ timeout: 10_000 });

    await panel.getByRole('button', { name: /^end break$/i }).click();
    await expect(panel.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });

    await panel.getByRole('button', { name: /^clock out$/i }).click();
    await expect(panel.getByText(/off the clock/i)).toBeVisible({ timeout: 10_000 });

    // A second clock-in the same day. The once-per-day rule is switched off
    // for the whole CI E2E job (E2E_SKIP_HR_DAILY_LIMIT=1, so specs can reset
    // attendance state); the rule itself is covered in every environment by
    // src/modules/hr/daily-limit.test.ts. Here we assert whichever behaviour
    // the server under test is configured for — never neither.
    await panel.getByRole('button', { name: /^clock in$/i }).click();
    if (process.env.E2E_SKIP_HR_DAILY_LIMIT === '1') {
      await expect(panel.getByText(/^working$/i)).toBeVisible({ timeout: 10_000 });
      await panel.getByRole('button', { name: /^clock out$/i }).click();
      await expect(panel.getByText(/off the clock/i)).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(page.getByText(/already clocked in today/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
