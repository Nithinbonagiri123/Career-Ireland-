import { expect, test } from '@playwright/test';

/**
 * Candidate Services finishing round:
 *  - Leads: one date range. Legacy `createdFrom` / `createdTo` links still
 *    work and show as Custom; changing the range clears both families; the
 *    Filter menu writes the canonical `from` / `to`.
 *  - Leads: Candidate Services row actions sit on one line at desktop width.
 *  - Services list: phones get cards (no sideways scroll, actions reachable).
 *  - Payments: the five tiles form a deliberate phone layout.
 */

const params = (url: string) => new URL(url).searchParams;

test.describe('Leads date range', () => {
  test('legacy createdFrom shows as Custom and Anytime clears both forms', async ({ page }) => {
    await page.goto('/leads?assigned=all&createdFrom=2026-01-01', { waitUntil: 'networkidle' });
    const dates = page.getByRole('tablist', { name: /created date filter/i });
    await expect(dates.getByRole('tab', { name: /anytime/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await expect(dates.getByRole('button', { name: /2026-01-01/ })).toBeVisible();

    await dates.getByRole('tab', { name: /anytime/i }).click();
    await expect.poll(() => params(page.url()).get('createdFrom')).toBeNull();
    expect(params(page.url()).get('from')).toBeNull();
    await expect(dates.getByRole('tab', { name: /anytime/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('exact dates in the Filter menu write the canonical from / to', async ({ page }) => {
    await page.goto('/leads?assigned=all&createdFrom=2026-01-01', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Filter/ }).click();
    await page.locator('#leads-filter-created-to').fill('2026-12-31');
    await expect.poll(() => params(page.url()).get('to')).toBe('2026-12-31');
    expect(params(page.url()).get('from')).toBe('2026-01-01');
    expect(params(page.url()).get('createdFrom')).toBeNull();
    expect(params(page.url()).get('createdTo')).toBeNull();
  });
});

test('Leads: Candidate Services row actions fit on one line at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/leads?assigned=all&status=NEW', { waitUntil: 'networkidle' });
  const pay = page.getByRole('button', { name: 'Direct Payment & Convert' }).first();
  if ((await pay.count()) === 0)
    test.skip(true, 'no open Candidate Services lead in this database');
  const row = pay.locator('xpath=ancestor::tr[1]');
  const proForma = row.getByRole('link', { name: 'Create Pro Forma' });
  const open = row.getByRole('link', { name: 'Open Workspace' });
  const [a, b, c] = await Promise.all([
    pay.boundingBox(),
    proForma.boundingBox(),
    open.boundingBox(),
  ]);
  expect(a && b && c).toBeTruthy();
  // Same line (vertical centres within a few pixels) and inside the viewport.
  const mid = (r: { y: number; height: number }) => r.y + r.height / 2;
  if (a && b && c) {
    expect(Math.abs(mid(a) - mid(b))).toBeLessThan(4);
    expect(Math.abs(mid(a) - mid(c))).toBeLessThan(4);
    expect(c.x + c.width).toBeLessThanOrEqual(1440);
  }
});

test.describe('phones', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Services list shows cards with reachable actions and no sideways scroll', async ({
    page,
  }) => {
    await page.goto('/engagements', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const card = page.getByTestId('engagement-list-card').first();
    if ((await card.count()) === 0) test.skip(true, 'no services in this database');
    await expect(card).toBeVisible();
    await expect(page.locator('table').first()).toBeHidden();
    const actions = card.getByRole('button', { name: 'Actions' });
    await expect(actions).toBeVisible();
    const box = await actions.boundingBox();
    expect(box && box.x + box.width <= 390).toBe(true);
  });

  test('Payments: Total Paid leads full width, the other four form a 2×2 grid', async ({
    page,
  }) => {
    await page.goto('/payments', { waitUntil: 'networkidle' });
    // The tile card is the nearest rounded-2xl ancestor of its label.
    const tile = (label: string) =>
      page
        .getByText(label, { exact: true })
        .first()
        .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    const boxes = await Promise.all(
      ['Total Paid', 'Pending', 'Invoices Issued', 'Receipts Issued', 'Overdue'].map((l) =>
        tile(l).boundingBox(),
      ),
    );
    const [paid, pending, invoices, receipts, overdue] = boxes;
    expect(boxes.every(Boolean)).toBe(true);
    if (paid && pending && invoices && receipts && overdue) {
      // Total Paid spans the row; the rest pair up two by two.
      expect(paid.width).toBeGreaterThan(pending.width * 1.8);
      expect(Math.abs(pending.y - invoices.y)).toBeLessThan(4);
      expect(Math.abs(receipts.y - overdue.y)).toBeLessThan(4);
      expect(receipts.y).toBeGreaterThan(pending.y);
    }
  });
});
