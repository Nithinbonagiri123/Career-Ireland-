import { expect, type Page, test } from '@playwright/test';

/**
 * Stage 6G shared list controls — view toggle, filters, status tabs, sort
 * and pagination must work together: every change keeps the other choices
 * in the URL, and any filter change returns to page 1. Written to pass with
 * any number of rows in the database.
 */

const params = (page: Page) => new URL(page.url()).searchParams;

test.describe('Stage 6G list controls', () => {
  test('jobs: view, status, sort, search and page combine correctly', async ({ page }) => {
    await page.goto('/requisitions?assigned=all&view=table&per=12&page=2');
    const table = page.getByRole('link', { name: /^table$/i });
    await expect(table).toHaveAttribute('aria-pressed', 'true');

    // Status tab: keeps view + per, drops page.
    await page
      .getByRole('navigation', { name: 'Job status' })
      .getByRole('link', { name: /^filled/i })
      .click();
    await expect.poll(() => params(page).get('status')).toBe('filled');
    expect(params(page).get('view')).toBe('table');
    expect(params(page).get('per')).toBe('12');
    expect(params(page).get('page')).toBeNull();

    // Sort: keeps status + view.
    await page.getByRole('combobox', { name: /sort by/i }).selectOption('title');
    await expect.poll(() => params(page).get('sort')).toBe('title');
    expect(params(page).get('status')).toBe('filled');
    expect(params(page).get('view')).toBe('table');

    // Rows really are in title order.
    const titles = await page
      .locator('table tbody tr td:first-child')
      .evaluateAll((cells) =>
        cells.map((c) => (c.querySelector('a, span, div')?.textContent ?? '').trim()),
      );
    expect(titles.every((t) => t.length > 0)).toBe(true);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);

    // Search (debounced) keeps everything else and resets the page.
    await page.goto(`${page.url()}&page=3`);
    await page.getByRole('searchbox', { name: /search jobs/i }).fill('zz-no-such-job');
    await expect.poll(() => params(page).get('q')).toBe('zz-no-such-job');
    expect(params(page).get('page')).toBeNull();
    expect(params(page).get('status')).toBe('filled');
    expect(params(page).get('sort')).toBe('title');
    await expect(page.getByText(/no jobs match these filters/i)).toBeVisible();

    // Clear removes search + selects but keeps status tab, sort and view.
    await page.getByRole('link', { name: /^clear$/i }).click();
    await expect.poll(() => params(page).get('q')).toBeNull();
    expect(params(page).get('status')).toBe('filled');
    expect(params(page).get('view')).toBe('table');

    // Switch to Cards (the default) keeps filters, drops the view param.
    await page.getByRole('link', { name: /^cards$/i }).click();
    await expect.poll(() => params(page).get('view')).toBeNull();
    expect(params(page).get('status')).toBe('filled');
    await expect(page.getByRole('link', { name: /^cards$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('jobs: an out-of-range page clamps to the last page', async ({ page }) => {
    await page.goto('/requisitions?assigned=all&page=9999');
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    if ((await pager.count()) === 0) test.skip(true, 'no jobs in this database');
    await expect(pager.getByText(/^showing \d+ to \d+ of \d+ jobs$/i)).toBeVisible();
    const current = pager.locator('[aria-current="page"]');
    const next = pager.getByRole('link', { name: /next page/i });
    await expect(next).toHaveCount(0);
    await expect(current).toHaveCount(1);
  });

  test('employers: table is the default, cards opt in, status tab persists', async ({ page }) => {
    await page.goto('/employers?assigned=all');
    await expect(page.getByRole('link', { name: /^table$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page
      .getByRole('navigation', { name: 'Employer status' })
      .getByRole('link', { name: /^prospect/i })
      .click();
    await expect.poll(() => params(page).get('status')).toBe('prospect');
    await page.getByRole('link', { name: /^cards$/i }).click();
    await expect.poll(() => params(page).get('view')).toBe('grid');
    expect(params(page).get('status')).toBe('prospect');
    await page.getByRole('combobox', { name: /sort by/i }).selectOption('name');
    await expect.poll(() => params(page).get('sort')).toBe('name');
    expect(params(page).get('view')).toBe('grid');
  });

  test('scope and date filters: labelled, keyboard reachable, arrow keys move', async ({
    page,
  }) => {
    await page.goto('/employers');
    const dates = page.getByRole('tablist', { name: /created date filter/i });
    await expect(dates).toBeVisible();
    await dates.getByRole('tab', { name: /anytime/i }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(dates.getByRole('tab', { name: /this month/i })).toBeFocused();
    await page.keyboard.press('End');
    await expect(dates.getByRole('button', { name: /custom/i })).toBeFocused();

    const scope = page.getByRole('tablist', { name: /assignment filter/i });
    await scope.getByRole('tab').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(scope.getByRole('tab').nth(1)).toBeFocused();

    // Every select in the filter bar has an accessible name.
    const selects = page.getByRole('region', { name: 'Filters' }).getByRole('combobox');
    for (const s of await selects.all()) {
      await expect(s).toHaveAccessibleName(/.+/);
    }
  });

  test('phone width: filter trays wrap, page never scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ['/requisitions?assigned=all', '/employers?assigned=all&view=grid']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, url).toBeLessThanOrEqual(390);
      const tray = page.getByRole('tablist', { name: /created date filter/i });
      const box = await tray.boundingBox();
      expect(box && box.x + box.width, url).toBeLessThanOrEqual(390);
    }
  });
});
