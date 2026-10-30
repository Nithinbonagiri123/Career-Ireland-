import { expect, type Page, test } from '@playwright/test';

/**
 * Stage 6G Candidates list — shared-kit filters keep their multi-select
 * behaviour in the URL, "More filters" works on phones, the Cards/Table
 * switch keeps every filter, and both views show the same rows.
 */

const params = (page: Page) => new URL(page.url()).searchParams;

test.describe('Candidates list (Stage 6G)', () => {
  test('multi-select status writes a comma-separated URL and survives reload', async ({ page }) => {
    await page.goto('/candidates?assigned=all', { waitUntil: 'networkidle' });
    const filters = page.getByRole('region', { name: 'Filters' });
    await filters.getByRole('button', { name: 'Status', exact: true }).click();
    const group = page.getByRole('group', { name: 'Status', exact: true });
    await group.getByText('Available', { exact: true }).click();
    await expect.poll(() => params(page).get('status')).toBe('AVAILABLE');
    await group.getByText('Placed', { exact: true }).click();
    await expect.poll(() => params(page).get('status')).toBe('AVAILABLE,PLACED');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(filters.getByRole('button', { name: 'Status', exact: true })).toContainText(
      '2 selected',
    );
    await filters.getByRole('button', { name: 'Status', exact: true }).click();
    await expect(
      page
        .getByRole('group', { name: 'Status', exact: true })
        .getByRole('checkbox', { name: 'Placed' }),
    ).toBeChecked();
  });

  test('Cards/Table switch keeps filters and sort', async ({ page }) => {
    await page.goto('/candidates?assigned=all&status=AVAILABLE&sort=name', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('link', { name: /^cards$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('link', { name: /^table$/i }).click();
    await expect.poll(() => params(page).get('view')).toBe('table');
    expect(params(page).get('status')).toBe('AVAILABLE');
    expect(params(page).get('sort')).toBe('name');
    expect(params(page).get('assigned')).toBe('all');
  });

  test('cards and table show the same filtered rows', async ({ page }) => {
    const base = '/candidates?assigned=all&status=AVAILABLE&per=48&sort=name';
    await page.goto(base, { waitUntil: 'networkidle' });
    const cardNames = await page
      .locator('article[aria-label^="Candidate "]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')?.slice(10) ?? ''));
    const summary = await page.getByText(/^Showing \d+ to \d+ of \d+ candidates$/).textContent();

    await page.goto(`${base}&view=table`, { waitUntil: 'networkidle' });
    const rowNames = await page
      .locator('table tbody tr td:nth-child(2) span:first-child')
      .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
    await expect(page.getByText(/^Showing \d+ to \d+ of \d+ candidates$/)).toHaveText(
      summary ?? '',
    );
    expect(rowNames).toEqual(cardNames);
    // DataTable's own search box is gone: the filter bar is the only search.
    await expect(page.getByPlaceholder('Search candidates…')).toHaveCount(0);
  });

  test('phone: More filters reveals secondary filters and counts hidden ones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/candidates?assigned=all&immigration=STAMP_4', { waitUntil: 'networkidle' });
    const filters = page.getByRole('region', { name: 'Filters' });
    const more = filters.getByRole('button', { name: /more filters/i });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toContainText('1');
    await expect(filters.getByRole('button', { name: 'Irish status' })).toBeHidden();
    await more.click();
    await expect(filters.getByRole('button', { name: 'Irish status' })).toBeVisible();
    await expect(filters.getByRole('button', { name: 'Irish status' })).toContainText('Stamp 4');

    for (const url of ['/candidates?assigned=all', '/candidates?assigned=all&view=table']) {
      await page.goto(url, { waitUntil: 'networkidle' });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, url).toBeLessThanOrEqual(390);
    }
  });

  test('status tabs keep their pre-6G scope behaviour', async ({ page }) => {
    // Default scope is "Assigned to me"; the tabs look across owners.
    await page.goto('/candidates', { waitUntil: 'networkidle' });
    const tabs = page.getByRole('navigation', { name: 'Candidate status' });
    await tabs.getByRole('link', { name: /^Unassigned/ }).click();
    await expect.poll(() => params(page).get('assigned')).toBe('unassigned');
    expect(params(page).get('status')).toBeNull();
    await expect(tabs.getByRole('link', { name: /^Unassigned/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await tabs.getByRole('link', { name: /^Available/ }).click();
    await expect.poll(() => params(page).get('status')).toBe('AVAILABLE');
    expect(params(page).get('assigned')).toBe('all');
  });
});
