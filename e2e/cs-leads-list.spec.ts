import { expect, type Page, test } from '@playwright/test';

/**
 * Stage 6G Leads list (Candidate Services): multi-select filters live in the
 * URL as comma-separated values, the Cards/Table switch keeps every filter,
 * both views render the same filtered + paginated rows, phones never scroll
 * sideways, and table row actions are never clipped on desktop.
 */

const params = (page: Page) => new URL(page.url()).searchParams;
const filters = (page: Page) => page.getByRole('region', { name: 'Filters' });

test.describe('Leads list (Stage 6G)', () => {
  test('multi-select Status writes a comma-separated URL and survives reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/leads?assigned=all', { waitUntil: 'networkidle' });
    const status = filters(page).getByRole('button', { name: /^Status/ });
    await status.click();
    await expect(status).toHaveAttribute('aria-expanded', 'true');
    // Users click the visible label; the native checkbox is screen-reader-only.
    const option = (name: string) =>
      page.locator('label').filter({ hasText: new RegExp(`^${name}$`) });
    await option('New').click();
    await expect(page.getByRole('checkbox', { name: 'New' })).toBeChecked();
    await expect.poll(() => params(page).get('status')).toBe('NEW');
    await option('Contacted').click();
    await expect.poll(() => params(page).get('status')).toBe('NEW,CONTACTED');
    await page.keyboard.press('Escape');
    await expect(status).toHaveAttribute('aria-expanded', 'false');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(filters(page).getByRole('button', { name: /^Status/ })).toContainText(
      '2 selected',
    );
    // The existing "Filter" menu still counts the same params.
    await expect(page.getByRole('button', { name: /^Filter.*\d/ })).toBeVisible();
  });

  test('Cards/Table switch keeps filters; both views show the same rows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const base = '/leads?assigned=all&status=NEW,CONTACTED,CONVERTED&per=25';
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: /^table$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    const tableSummary = (await pager.count()) ? await pager.locator('p').first().innerText() : '';
    const tableNames = await page
      .locator('table tbody tr td:first-child a')
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));

    await page.getByRole('link', { name: /^cards$/i }).click();
    await expect.poll(() => params(page).get('view')).toBe('grid');
    expect(params(page).get('status')).toBe('NEW,CONTACTED,CONVERTED');
    expect(params(page).get('per')).toBe('25');
    await page.waitForLoadState('networkidle');
    const cardSummary = (await pager.count()) ? await pager.locator('p').first().innerText() : '';
    const cardNames = await page
      .getByTestId('lead-card')
      .locator('h3')
      .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
    expect(cardSummary).toBe(tableSummary);
    expect(cardNames.length).toBe(tableNames.length);
    expect(cardNames.every((n, i) => tableNames[i]?.includes(n))).toBe(true);

    await page.getByRole('link', { name: /^table$/i }).click();
    await expect.poll(() => params(page).get('view')).toBeNull();
    expect(params(page).get('status')).toBe('NEW,CONTACTED,CONVERTED');
  });

  test('desktop table actions are not clipped at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/leads?assigned=all', { waitUntil: 'networkidle' });
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    const clipped = await table.evaluate((t) => {
      const box = t.parentElement as HTMLElement;
      return box.scrollWidth - box.clientWidth;
    });
    expect(clipped).toBeLessThanOrEqual(1);
    const actions = page.locator(
      'table tbody tr td:last-child button, table tbody tr td:last-child a',
    );
    const n = Math.min(await actions.count(), 12);
    for (let i = 0; i < n; i++) {
      const b = await actions.nth(i).boundingBox();
      if (b) expect(b.x + b.width).toBeLessThanOrEqual(1440);
    }
  });

  test('phone: cards, wrapping filters, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/leads?assigned=all', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await expect(page.getByTestId('lead-card').first()).toBeVisible();
    await expect(page.locator('table').first()).toBeHidden();
    await expect(filters(page).getByRole('button', { name: /more filters/i })).toBeVisible();
  });
});
