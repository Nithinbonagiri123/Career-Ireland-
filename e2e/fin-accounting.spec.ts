import { expect, type Page, test } from '@playwright/test';
import { type FinanceScenario, seedFinanceScenario } from './helpers/finance-fixtures';

/**
 * F5 — Accounting on the Stage 6G kit. With populated ledger data (the
 * finance fixture), every accounting screen fits phone / tablet / desktop
 * without sideways scrolling and without tables clipped by their card;
 * report dates come from the URL and bad dates don't crash; repeated
 * controls have unique names; dialogs fit a phone and say "Cancel".
 * Read-only: nothing is submitted.
 */

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'desktop', width: 1440, height: 1000 },
] as const;

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

async function open(page: Page, url: string) {
  const r = await page.goto(url, { waitUntil: 'networkidle' });
  expect(r?.status(), url).toBe(200);
  await expect(page.getByRole('heading', { name: /something went wrong/i })).toHaveCount(0);
}

/** Sideways overflow of the scrolling <main>, and tables cut off by a non-scrolling ancestor. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    let clipped = 0;
    for (const t of Array.from(document.querySelectorAll('table'))) {
      if (!(t as HTMLElement).offsetParent) continue; // hidden variant
      let a = t.parentElement;
      while (a && a !== document.body) {
        if (getComputedStyle(a).overflowX !== 'visible') break;
        a = a.parentElement;
      }
      if (!a || a === document.body) continue;
      const ox = getComputedStyle(a).overflowX;
      if (ox !== 'auto' && ox !== 'scroll' && t.scrollWidth > a.clientWidth + 1) clipped++;
    }
    return { overflowX: main ? main.scrollWidth - main.clientWidth : 0, clipped };
  });
}

function screens(): Array<[string, string]> {
  return [
    ['hub', '/admin/accounting'],
    ['accounts', '/admin/accounting/accounts'],
    ['journals', '/admin/accounting/journals'],
    ['journal', s.urls.journalDetail],
    ['journal-reversed', s.urls.reversedJournal],
    ['events', '/admin/accounting/events'],
    ['periods', '/admin/accounting/periods'],
    ['trial-balance', '/admin/accounting/trial-balance'],
    ['profit-loss', '/admin/accounting/profit-loss'],
    ['balance-sheet', '/admin/accounting/balance-sheet'],
    ['vat', '/admin/accounting/vat'],
    ['year-end', '/admin/accounting/year-end'],
    ['ap', '/admin/accounting/ap'],
    ['bills', '/admin/accounting/ap/bills'],
    ['bill', s.urls.billDetail],
    ['suppliers', '/admin/accounting/ap/suppliers'],
  ];
}

for (const w of WIDTHS) {
  test(`every accounting screen fits at ${w.name} (${w.width}px)`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: w.width, height: w.height });
    const problems: string[] = [];
    for (const [name, url] of screens()) {
      await open(page, url);
      const m = await layout(page);
      if (m.overflowX > 0 || m.clipped > 0) problems.push(`${name}: ${JSON.stringify(m)}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('populated records and formatted amounts are visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const main = page.locator('main').first();

  await open(page, '/admin/accounting/journals');
  await expect(main.getByText(s.journals.invoice.number, { exact: true }).first()).toBeVisible();
  await expect(main.getByRole('cell', { name: 'Reversed' }).first()).toBeVisible();

  await open(page, s.urls.journalDetail);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(s.journals.invoice.number);
  await expect(main.locator('tfoot')).toContainText('Totals');
  await expect(main.locator('tfoot')).toContainText('€');

  await open(page, s.urls.billDetail);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(s.bills.part.number);
  await expect(main.getByText('Partially paid').first()).toBeVisible();
  await expect(main.getByText(/€1,476\.00/).first()).toBeVisible();

  await open(page, '/admin/accounting/trial-balance');
  await expect(main.locator('tfoot')).toContainText('Totals');
  await expect(main.getByRole('status').first()).toContainText(/Balanced|Out of balance/);

  await open(page, '/admin/accounting/vat');
  await expect(main.getByText(/€230\.00/).first()).toBeVisible();
});

test('report dates come from the URL and invalid dates do not crash', async ({ page }) => {
  await open(page, '/admin/accounting/trial-balance?asOf=garbage');
  await expect(page.getByRole('heading', { name: 'Trial balance', level: 1 })).toBeVisible();
  await expect(page.getByLabel('As of')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

  await open(page, '/admin/accounting/balance-sheet?asOf=2026-02-31');
  await expect(page.getByRole('heading', { name: 'Balance sheet', level: 1 })).toBeVisible();

  await open(page, '/admin/accounting/profit-loss?from=nope&to=2026-13-01');
  await expect(page.getByRole('heading', { name: /profit/i, level: 1 })).toBeVisible();

  await open(page, '/admin/accounting/vat?from=x&to=y');
  await expect(page.getByRole('heading', { name: 'VAT return', level: 1 })).toBeVisible();

  // A valid date is echoed into the picker and the description.
  await open(page, '/admin/accounting/balance-sheet?asOf=2026-01-15');
  await expect(page.getByLabel('As of')).toHaveValue('2026-01-15');
  await expect(page.getByText(/as at 15 Jan 2026/)).toBeVisible();

  // Picking a quick range rewrites the URL params the server reads.
  await open(page, '/admin/accounting/profit-loss');
  await page.getByRole('button', { name: 'This year' }).click();
  await expect(page).toHaveURL(/from=\d{4}-01-01&to=\d{4}-12-31/);
});

async function expectUniqueNames(page: Page, role: 'link' | 'button', pattern: RegExp) {
  const els = page.getByRole(role, { name: pattern });
  const names: string[] = [];
  for (let i = 0; i < (await els.count()); i++) {
    const el = els.nth(i);
    if (!(await el.isVisible())) continue;
    names.push((await el.getAttribute('aria-label')) ?? (await el.innerText()));
  }
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size, names.join(' | ')).toBe(names.length);
}

test('repeated row controls have unique accessible names', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, '/admin/accounting/journals');
  await expectUniqueNames(page, 'link', /^Open journal /);
  await open(page, '/admin/accounting/ap/bills');
  await expectUniqueNames(page, 'link', /^Open bill /);
  await open(page, '/admin/accounting/periods');
  await expectUniqueNames(page, 'button', /^Transition /);
  await open(page, '/admin/accounting/ap/suppliers');
  await expectUniqueNames(page, 'button', /^Edit /);
  // Hub cards: one link per card, named after the card.
  await open(page, '/admin/accounting');
  await expect(page.getByRole('link', { name: 'Trial balance', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Accounts Payable', exact: true })).toHaveCount(1);
  // Phone cards keep the same unique names.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/admin/accounting/journals');
  await expectUniqueNames(page, 'link', /^Open journal /);
});

async function dialogFits(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390 + 0.5);
  }
  const inner = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
  expect(inner).toBeLessThanOrEqual(0);
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('accounting dialogs fit a phone and have a labelled Cancel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await open(page, '/admin/accounting/journals?post=1');
  const jd = page.getByRole('dialog');
  await expect(jd).toBeVisible();
  // Balance indicator: text + figures, not colour alone.
  await expect(jd.getByRole('status')).toContainText('Not balanced');
  await expect(jd.getByRole('status')).toContainText(/DR\s+\d/);
  await expect(jd.getByLabel('Journal date')).toBeVisible();
  await expect(jd.getByRole('group', { name: 'Journal lines' })).toBeVisible();
  await dialogFits(page);

  await open(page, '/admin/accounting/ap/bills');
  await page.getByRole('button', { name: /new bill/i }).click();
  await expect(page.getByRole('dialog').getByLabel('Total', { exact: true })).toBeVisible();
  await dialogFits(page);

  await open(page, '/admin/accounting/ap/suppliers');
  await page.getByRole('button', { name: /add supplier/i }).click();
  await expect(page.getByRole('dialog').getByLabel('Email')).toHaveAttribute('type', 'email');
  await dialogFits(page);

  await open(page, s.urls.billDetail);
  await page.getByRole('button', { name: /record payment/i }).click();
  await expect(page.getByRole('dialog').getByLabel(/^Amount/)).toBeVisible();
  await dialogFits(page);
});
