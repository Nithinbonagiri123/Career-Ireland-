import { expect, test } from '@playwright/test';

/**
 * Stage 6G Payments: filters and view live in the URL (bookmarkable, survive
 * reload), the table's Actions column is fully on screen at desktop width,
 * phones never scroll sideways, and the ADMIN-only Verify / Reject menu items
 * are unchanged (the STAFF side is e2e/cs-payments.staff.spec.ts).
 */

const params = (url: string) => new URL(url).searchParams;

test.describe('/payments (Stage 6G)', () => {
  test('search, status and view are written to the URL and survive a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/payments?created=90d', { waitUntil: 'networkidle' });
    const filters = page.getByRole('region', { name: 'Filters' });

    await filters.getByRole('combobox', { name: 'Status' }).selectOption('paid');
    await expect.poll(() => params(page.url()).get('status')).toBe('paid');

    await filters.getByRole('searchbox').fill('zz-no-such-payment');
    await expect.poll(() => params(page.url()).get('q')).toBe('zz-no-such-payment');
    await expect(page.getByText(/no payments match the current filters/i)).toBeVisible();

    // Kit view toggle (links); cards are `view=grid`.
    await page.getByRole('link', { name: /Cards/ }).click();
    await expect.poll(() => params(page.url()).get('view')).toBe('grid');

    await page.reload({ waitUntil: 'networkidle' });
    expect(params(page.url()).get('created')).toBe('90d');
    await expect(filters.getByRole('combobox', { name: 'Status' })).toHaveValue('paid');
    await expect(filters.getByRole('searchbox')).toHaveValue('zz-no-such-payment');
    await expect(page.getByRole('link', { name: /Cards/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('desktop: the Actions column is fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/payments?created=90d', { waitUntil: 'networkidle' });
    const table = page.getByTestId('payments-table');
    if ((await table.count()) === 0) test.skip(true, 'no payments in this database');
    const header = table.getByRole('columnheader', { name: 'Actions' });
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    const wrap = await table.boundingBox();
    expect(box && wrap && box.x + box.width <= wrap.x + wrap.width + 1).toBe(true);
    expect(box && box.x + box.width <= 1440).toBe(true);
    // The wrapper does not need to scroll sideways.
    const scrolls = await table.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(scrolls).toBe(false);
  });

  test('phone: no sideways scroll, cards instead of the table', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/payments?created=90d', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await expect(page.getByTestId('payments-table')).toBeHidden();
  });

  test('ADMIN still gets Verify / Reject on a pending payment', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/payments?created=90d&status=pending', { waitUntil: 'networkidle' });
    const actions = page
      .getByTestId('payments-table')
      .getByRole('button', { name: /^Actions for / });
    if ((await actions.count()) === 0) test.skip(true, 'no pending payments in this database');
    await actions.first().click();
    await expect(page.getByRole('menuitem', { name: /Verify/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Reject/ })).toBeVisible();
  });

  test('the date filter shown always matches the rows listed', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const total = async () => {
      const text =
        (await page
          .getByText(/^Showing \d+ to \d+ of \d+/)
          .first()
          .textContent()) ?? '';
      return Number(/of (\d+)/.exec(text)?.[1] ?? 0);
    };
    const tableDates = () =>
      page
        .getByTestId('payments-table')
        .locator('time[datetime]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));

    // Default: "This month" is selected and every listed payment is in it.
    await page.goto('/payments', { waitUntil: 'networkidle' });
    const dates = page.getByRole('tablist', { name: /created date filter/i });
    await expect(dates.getByRole('tab', { name: /this month/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const now = new Date();
    for (const iso of await tableDates()) {
      const d = new Date(iso);
      expect(d.getUTCFullYear()).toBe(now.getUTCFullYear());
      expect(d.getUTCMonth()).toBe(now.getUTCMonth());
    }
    const monthTotal = (await page.getByText(/no payments/i).count()) > 0 ? 0 : await total();

    // "Anytime" lifts the restriction: explicit URL, tab selected, and at
    // least as many payments as this month.
    await dates.getByRole('tab', { name: /anytime/i }).click();
    await expect.poll(() => params(page.url()).get('created')).toBe('all');
    await expect(dates.getByRole('tab', { name: /anytime/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.waitForLoadState('networkidle');
    expect(await total()).toBeGreaterThanOrEqual(monthTotal);

    // Choosing "This month" again returns to the clean default URL.
    await dates.getByRole('tab', { name: /this month/i }).click();
    await expect.poll(() => params(page.url()).get('created')).toBeNull();
  });
});
