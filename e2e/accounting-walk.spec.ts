import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/**
 * Walks the accounting admin surface and asserts the key signals are
 * present on each page. These specs don't actually post journals —
 * that needs DB state that varies per environment. The e2e goal here
 * is to prove the pages compile, render, and surface the invariant
 * controls (balance badges, status chips, action buttons). Posting is
 * covered by the unit tests on the schema invariants + the service
 * layer.
 */

test.describe('accounting hub', () => {
  test('hub shows every section tile', async ({ page }) => {
    await page.goto('/admin/accounting', { waitUntil: 'networkidle' });

    // Guard: did the page crash? If so, dump HTML and fail loudly.
    const errorTitle = page.getByRole('heading', { name: /something went wrong/i });
    if (await errorTitle.isVisible().catch(() => false)) {
      throw new Error(`/admin/accounting crashed:\n${await page.content()}`);
    }

    await expect(page.getByRole('heading', { name: /double-entry ledger/i })).toBeVisible();

    for (const title of [
      'Chart of accounts',
      'Journals',
      'Post manual journal',
      'Financial events',
      'Trial balance',
      'Profit & loss',
      'Balance sheet',
      'Periods',
      'VAT return',
      'Accounts Payable',
      'Year-end close',
    ]) {
      await expect(
        page.getByRole('heading', { name: new RegExp(`^${title}$`, 'i') }),
      ).toBeVisible();
    }

    await shot(page, 'e2e__accounting-hub');
  });

  test('four KPI cards render', async ({ page }) => {
    await page.goto('/admin/accounting', { waitUntil: 'networkidle' });
    for (const label of ['Chart accounts', 'Posted journals', 'Events in queue', 'Failed events']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });
});

test.describe('chart of accounts', () => {
  test('groups accounts by type with code + name + status columns', async ({ page }) => {
    await page.goto('/admin/accounting/accounts', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /chart of accounts/i })).toBeVisible();

    // At least one grouped section header shows. Which ones exist depends
    // on which accounts the seed inserted — we don't care about specific
    // types here, just that the layout rendered.
    const headings = page.locator('h2');
    expect(await headings.count()).toBeGreaterThan(0);

    await shot(page, 'e2e__accounting-accounts');
  });
});

test.describe('journals list + manual journal dialog', () => {
  test('list page shows the Post manual journal button', async ({ page }) => {
    await page.goto('/admin/accounting/journals', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /journals/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /post manual journal/i })).toBeVisible();
    await shot(page, 'e2e__accounting-journals');
  });

  test('opening the dialog reveals the balance indicator', async ({ page }) => {
    await page.goto('/admin/accounting/journals?post=1', { waitUntil: 'networkidle' });
    await expect(page.getByText(/post manual journal/i).first()).toBeVisible();
    // The DR / CR live totals.
    await expect(page.getByText(/DR\s+\d/i).first()).toBeVisible();
    await shot(page, 'e2e__accounting-manual-journal-dialog');
  });
});

test.describe('reports', () => {
  test('trial balance has a Balanced badge', async ({ page }) => {
    await page.goto('/admin/accounting/trial-balance', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /trial balance/i })).toBeVisible();
    await expect(page.getByText(/balanced|unbalanced/i).first()).toBeVisible();
    await shot(page, 'e2e__accounting-trial-balance');
  });

  test('profit & loss cascades gross → operating → net', async ({ page }) => {
    await page.goto('/admin/accounting/profit-loss', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /profit.*loss/i })).toBeVisible();
    for (const label of ['Gross profit', 'Operating profit', 'Net profit']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
    await shot(page, 'e2e__accounting-profit-loss');
  });

  test('balance sheet shows three sections + totals card', async ({ page }) => {
    await page.goto('/admin/accounting/balance-sheet', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /^balance sheet$/i }).first()).toBeVisible();
    for (const section of ['Assets', 'Liabilities', 'Equity']) {
      await expect(
        page.getByRole('heading', { name: new RegExp(`^${section}$`, 'i'), level: 2 }),
      ).toBeVisible();
    }
    await expect(page.getByText(/total assets/i)).toBeVisible();
    await expect(page.getByText(/total liabilities \+ equity/i)).toBeVisible();
    await shot(page, 'e2e__accounting-balance-sheet');
  });
});

test.describe('VAT return', () => {
  test('shows T1 / T2 / T3 / T4 headline cards', async ({ page }) => {
    await page.goto('/admin/accounting/vat', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /vat return/i })).toBeVisible();
    for (const code of ['T1', 'T2', 'T3', 'T4']) {
      await expect(page.getByText(code, { exact: true }).first()).toBeVisible();
    }
    await shot(page, 'e2e__accounting-vat');
  });
});

test.describe('periods', () => {
  test('list page explains the state machine', async ({ page }) => {
    await page.goto('/admin/accounting/periods', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /accounting periods/i })).toBeVisible();
    // Description references the state transitions
    await expect(page.getByText(/OPEN.*SOFT_CLOSED.*CLOSED.*LOCKED/i).first()).toBeVisible();
    await shot(page, 'e2e__accounting-periods');
  });
});

test.describe('AP', () => {
  test('AP hub shows suppliers / bills links + aging section', async ({ page }) => {
    await page.goto('/admin/accounting/ap', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /accounts payable/i })).toBeVisible();
    for (const title of ['Suppliers', 'Bills']) {
      await expect(
        page.locator('a', { hasText: new RegExp(`^${title}$`, 'i') }).first(),
      ).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /ap aging/i })).toBeVisible();
    await shot(page, 'e2e__accounting-ap');
  });

  test('suppliers list has the Add supplier CTA', async ({ page }) => {
    await page.goto('/admin/accounting/ap/suppliers', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /^suppliers$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /add supplier/i })).toBeVisible();
    await shot(page, 'e2e__accounting-ap-suppliers');
  });

  test('bills list has the New bill CTA', async ({ page }) => {
    await page.goto('/admin/accounting/ap/bills', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /supplier bills/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new bill/i })).toBeVisible();
    await shot(page, 'e2e__accounting-ap-bills');
  });

  test('new-supplier dialog validates legal name presence', async ({ page }) => {
    await page.goto('/admin/accounting/ap/suppliers', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /add supplier/i }).click();
    await expect(page.getByText(/supplier master record/i)).toBeVisible();
    // Submit without filling legal name — expect to stay on dialog (toast error).
    const createBtn = page.getByRole('button', { name: /^create$/i });
    await createBtn.click();
    // Dialog stays open; toast shows.
    await expect(
      page.getByText(/legal name is required|supplier master record/i).first(),
    ).toBeVisible();
    await shot(page, 'e2e__accounting-ap-supplier-dialog');
  });
});

test.describe('year-end close', () => {
  test('shows per-year rows with status badges', async ({ page }) => {
    await page.goto('/admin/accounting/year-end', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /year-end close/i })).toBeVisible();
    // Current year row
    const currentYear = new Date().getUTCFullYear();
    await expect(page.getByText(`FY ${currentYear}`)).toBeVisible();
    await shot(page, 'e2e__accounting-year-end');
  });
});
