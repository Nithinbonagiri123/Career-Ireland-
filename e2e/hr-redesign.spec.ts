import { expect, type Page, test } from '@playwright/test';
import { seedHrScenario } from './helpers/hr-fixtures';

/**
 * H1–H3 — Stage 6G HR screens on seeded, self-cleaning data: no sideways
 * scroll or clipped tables at phone / tablet / desktop, every row's
 * "Correct … attendance" control reachable (the old table clipped it),
 * state pills as text, absolute dates with the year, dialogs fit a
 * phone, keyboard access, and URL params surviving a reload.
 */

const WIDTHS = [
  ['phone', 390, 844],
  ['tablet', 820, 1100],
  ['desktop', 1440, 1000],
] as const;

async function layout(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    let clipped = 0;
    for (const t of Array.from(document.querySelectorAll('table'))) {
      if (t.closest('.sr-only') || t.offsetParent === null) continue;
      let a = t.parentElement;
      while (a && a !== document.body && getComputedStyle(a).overflowX === 'visible') {
        a = a.parentElement;
      }
      if (!a || a === document.body) continue;
      const ox = getComputedStyle(a).overflowX;
      if (ox !== 'auto' && ox !== 'scroll' && t.scrollWidth > a.clientWidth + 1) clipped++;
    }
    return { overflow: main ? main.scrollWidth - main.clientWidth : -1, clipped };
  });
}

test.describe('HR Stage 6G redesign', () => {
  test.describe.configure({ mode: 'serial' });
  let hr: Awaited<ReturnType<typeof seedHrScenario>>;

  test.beforeAll(async () => {
    hr = await seedHrScenario();
  });
  test.afterAll(async () => {
    await hr.cleanup();
    expect(await hr.remaining()).toEqual({ users: 0, profiles: 0, sessions: 0, breaks: 0 });
  });

  for (const [label, width, height] of WIDTHS) {
    test(`HR Board at ${label}: no overflow, every Correct action reachable`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1, name: 'HR Board' })).toBeVisible();
      expect(await layout(page)).toEqual({ overflow: 0, clipped: 0 });

      for (const name of Object.values(hr.names)) {
        if (name === hr.names.onLeave) continue; // on-leave person may have no recent row
        const btn = page.getByRole('button', { name: `Correct ${name}'s attendance` }).first();
        await btn.scrollIntoViewIfNeeded();
        await expect(btn).toBeVisible();
        await expect(btn).toBeInViewport();
        await btn.focus();
        await expect(btn).toBeFocused();
      }
      // State pills are text, and dates carry the year.
      const scope = page.locator('main');
      for (const pill of ['Working', 'On break', 'Missing clock-out', 'Corrected', 'Auto-closed']) {
        await expect(
          scope.getByText(pill, { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible();
      }
      await expect(
        scope
          .getByText(/\b20\d\d · \d\d:\d\d/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    });
  }

  test('correction dialog fits a phone and keeps its validation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: `Correct ${hr.names.working}'s attendance` })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width ?? 999).toBeLessThanOrEqual(390);
    await expect(dialog.getByText(/time zone/i)).toBeVisible();
    // Too-short reason is refused client-side (nothing is saved).
    await dialog.getByLabel(/^Reason/).fill('x');
    await dialog.getByRole('button', { name: 'Save correction' }).click();
    await expect(dialog.getByRole('alert')).toContainText('at least 3 characters');
    await expect(dialog.getByLabel(/^Reason/)).toHaveAttribute('aria-invalid', 'true');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('staff profile dialog fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: `Edit HR profile for ${hr.names.working}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect((await dialog.boundingBox())?.width ?? 999).toBeLessThanOrEqual(390);
    await expect(dialog.getByLabel('Reporting manager')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('keyboard Tab reaches a Correct action on the HR Board', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
    const firstCorrect = page.getByRole('button', { name: /^Correct .*'s attendance$/ }).first();
    await firstCorrect.scrollIntoViewIfNeeded();
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() =>
        /^Correct .*'s attendance$/.test(document.activeElement?.getAttribute('aria-label') ?? ''),
      );
    }
    expect(reached).toBe(true);
  });

  test('HR Board date params survive a reload', async ({ page }) => {
    await page.goto('/hr/admin?created=all', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    expect(new URL(page.url()).searchParams.get('created')).toBe('all');
    await expect(page.getByText(hr.names.missing).first()).toBeVisible();
  });

  for (const [label, width, height] of WIDTHS) {
    test(`My attendance, My team and dashboard at ${label}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height });
      await page.goto('/hr', { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1, name: 'My attendance' })).toBeVisible();
      expect(await layout(page)).toEqual({ overflow: 0, clipped: 0 });

      await page.goto('/hr/team', { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1, name: 'My team' })).toBeVisible();
      expect(await layout(page)).toEqual({ overflow: 0, clipped: 0 });
      const list = page.getByRole('list', { name: 'Direct reports' });
      for (const name of Object.values(hr.names)) {
        await expect(list.getByText(name)).toBeVisible();
      }
      await expect(list.getByText('Missing clock-out', { exact: true }).first()).toBeVisible();
      await expect(list.getByText(/\b20\d\d · \d\d:\d\d/).first()).toBeVisible();

      await page.goto('/dashboard', { waitUntil: 'networkidle' });
      const card = page.getByTestId('working-now-card');
      await expect(card).toBeVisible();
      await expect(card.getByText(hr.names.working)).toBeVisible();
      await expect(card.getByText(/since .*20\d\d · \d\d:\d\d/).first()).toBeVisible();
      expect(await layout(page)).toEqual({ overflow: 0, clipped: 0 });
    });
  }

  test('sidebar highlights only the current HR item', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/hr/team', { waitUntil: 'networkidle' });
    await expect(page.locator('aside a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('aside a[aria-current="page"]')).toContainText('My team');
  });
});
