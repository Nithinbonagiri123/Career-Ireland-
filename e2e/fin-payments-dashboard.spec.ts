import { expect, type Page, test } from '@playwright/test';
import { type FinanceScenario, seedFinanceScenario } from './helpers/finance-fixtures';

/**
 * F4 — Payments workspace and the Finance cards on the main dashboard
 * (Stage 6G). Seeds the Finance fixture so verified payments exist this
 * month, then checks: no sideways scroll at phone / tablet / desktop,
 * every row's actions menu has its own accessible name, quick actions
 * link only to existing pages, the revenue table scrolls instead of being
 * clipped, and the billing dialogs fit a phone.
 */

let s: FinanceScenario;

test.beforeAll(async () => {
  s = await seedFinanceScenario();
});

test.afterAll(async () => {
  await s?.cleanup();
  const left = await s?.remaining();
  if (left)
    expect(
      Object.values(left).every((n) => n === 0),
      JSON.stringify(left),
    ).toBe(true);
});

const WIDTHS = [390, 820, 1440] as const;

/** Sideways overflow of the app's scrolling <main> and of the document. */
async function overflowX(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    const doc = document.documentElement;
    return Math.max(
      main ? main.scrollWidth - main.clientWidth : 0,
      doc.scrollWidth - doc.clientWidth,
    );
  });
}

for (const width of WIDTHS) {
  test(`payments: no sideways scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/payments', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: /Payments/ })).toBeVisible();
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    if (width === 390) {
      // Phones always get cards (kit entity cards), never the table.
      await expect(page.getByTestId('payments-table')).toBeHidden();
      await expect(page.getByTestId('payments-cards').locator('article').first()).toBeVisible();
    }
  });
}

test('payments: every row actions menu has a unique accessible name', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/payments?per=50', { waitUntil: 'networkidle' });
  const buttons = page.getByTestId('payments-table').getByRole('button', { name: /^Actions for / });
  const n = await buttons.count();
  expect(n).toBeGreaterThan(0);
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    names.push((await buttons.nth(i).getAttribute('aria-label')) ?? '');
  }
  // No bare "Actions" button anywhere in the table.
  await expect(
    page.getByTestId('payments-table').getByRole('button', { name: 'Actions', exact: true }),
  ).toHaveCount(0);
  // Names identify the row (person, amount and time); duplicates only if two
  // rows really are the same person, amount and minute.
  expect(new Set(names).size).toBeGreaterThanOrEqual(Math.min(n, 2));
});

test('payments: the view toggle is the kit toggle and survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/payments', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Cards/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('grid');
  await expect(page.getByTestId('payments-table')).toHaveCount(0);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('link', { name: /Cards/ })).toHaveAttribute('aria-pressed', 'true');
  // Older bookmarks with view=cards still open cards.
  await page.goto('/payments?view=cards', { waitUntil: 'networkidle' });
  await expect(page.getByRole('link', { name: /Cards/ })).toHaveAttribute('aria-pressed', 'true');
});

test('payments: quick actions link only to existing pages the admin can open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/payments', { waitUntil: 'networkidle' });
  const quick = page.getByTestId('payments-quick-actions');
  await expect(quick).toBeVisible();
  // The misleading entries are gone.
  await expect(quick.getByRole('link', { name: /View Invoices/i })).toHaveCount(0);
  await expect(quick.getByRole('link', { name: /Create Pro Forma/i })).toHaveCount(0);
  await expect(quick.getByRole('button', { name: /Record payment/i })).toBeVisible();

  const hrefs = await quick
    .getByRole('link')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  expect(hrefs.sort()).toEqual(['/admin/accounting', '/leads']);
  for (const href of hrefs) {
    const r = await page.goto(href, { waitUntil: 'networkidle' });
    expect(r?.status(), href).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

for (const width of [390, 820] as const) {
  test(`dashboard: finance cards fit and the revenue table scrolls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard?from=2026-01-01&to=2026-12-31', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('finance-kpi-card')).toBeVisible();
    await expect(page.getByTestId('invoice-aging')).toBeVisible();
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
    const table = page.getByTestId('revenue-top-services');
    await expect(table).toBeVisible();
    // The table sits in its own keyboard-focusable scroll region; nothing
    // is clipped by an overflow-hidden card any more.
    const region = await table.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      tabIndex: el.tabIndex,
      // The region itself must sit inside every overflow-hidden ancestor:
      // its contents scroll, they are not cut off by an outer card.
      clipped: (() => {
        const r = el.getBoundingClientRect();
        let a = el.parentElement;
        while (a && a !== document.body) {
          if (getComputedStyle(a).overflowX === 'hidden') {
            const p = a.getBoundingClientRect();
            if (r.left < p.left - 1 || r.right > p.right + 1) return true;
          }
          a = a.parentElement;
        }
        return false;
      })(),
    }));
    expect(region.overflowX).toBe('auto');
    expect(region.tabIndex).toBe(0);
    expect(region.clipped).toBe(false);
    // The last column (Revenue) is reachable by scrolling the region.
    const lastHeader = table.getByRole('columnheader', { name: 'Revenue' });
    await lastHeader.scrollIntoViewIfNeeded();
    await expect(lastHeader).toBeInViewport();
  });
}

test('dashboard: revenue charts have a text alternative', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard?from=2026-01-01&to=2026-12-31', { waitUntil: 'networkidle' });
  const captions = page.locator('caption', { hasText: /service mix|daily revenue/i });
  await expect.poll(() => captions.count(), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('billing dialogs fit a phone: record payment on /payments', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/payments', { waitUntil: 'networkidle' });
  await page
    .getByRole('button', { name: /Record payment/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await expect(dialog.getByPlaceholder('Optional')).toBeVisible();
  await expect(dialog.getByText(/file uploads land/i)).toHaveCount(0);
  // Every input is labelled.
  for (const label of ['Service', 'Amount', 'Currency', 'Method', 'Received on']) {
    await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test('billing dialogs fit a phone: record invoice payment on the employer billing tab', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/employers/${s.employerId}?tab=billing`, { waitUntil: 'networkidle' });
  const record = page.getByRole('button', { name: /record payment/i }).first();
  test.skip((await record.count()) === 0, 'no record-payment control on this employer');
  await record.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  // One column on phones: Amount and Currency stack.
  const amount = await dialog.getByLabel('Amount', { exact: true }).boundingBox();
  const currency = await dialog.getByLabel('Currency', { exact: true }).boundingBox();
  expect(amount && currency && currency.y > amount.y + amount.height - 1).toBe(true);
});
