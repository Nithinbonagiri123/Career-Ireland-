import { expect, type Page, test } from '@playwright/test';
import { type FinanceScenario, seedFinanceScenario } from './helpers/finance-fixtures';

/**
 * The Finance fixture seeds real-looking employer invoices / receipts,
 * supplier bills and posted journals, every populated screen renders them,
 * and cleanup removes exactly what was seeded.
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

async function open(page: Page, url: string) {
  const r = await page.goto(url, { waitUntil: 'networkidle' });
  expect(r?.status(), url).toBe(200);
  const main = page.locator('main').first();
  await expect(main).toBeVisible();
  return main;
}

test('employer invoices and receipt render', async ({ page }) => {
  let main = await open(page, s.urls.employerInvoice);
  await expect(main.getByText(s.paidInvoice.invoiceNumber).first()).toBeVisible();
  await expect(main.getByText(/1,230\.00/).first()).toBeVisible();
  main = await open(page, s.urls.employerPartInvoice);
  await expect(main.getByText(s.partInvoice.invoiceNumber).first()).toBeVisible();
  main = await open(page, s.urls.employerReceipt);
  await expect(main.getByText(s.paidInvoice.receiptNumber).first()).toBeVisible();
});

test('supplier bills and AP screens are populated', async ({ page }) => {
  let main = await open(page, '/admin/accounting/ap/bills');
  // Lists render a table (md+) and phone cards; check the visible one.
  await expect(main.getByText(s.bills.open.number).filter({ visible: true })).toBeVisible();
  // Lists render a table (md+) and phone cards; check the visible one.
  await expect(main.getByText(s.bills.part.number).filter({ visible: true })).toBeVisible();
  main = await open(page, s.urls.billDetail);
  await expect(main.getByText(s.bills.part.number).first()).toBeVisible();
  main = await open(page, '/admin/accounting/ap/suppliers');
  await expect(main.getByText(s.supplierName).first()).toBeVisible();
  await open(page, '/admin/accounting/ap');
});

test('journals and ledger reports are populated', async ({ page }) => {
  let main = await open(page, '/admin/accounting/journals');
  // Lists render a table (md+) and phone cards; check the visible one.
  await expect(main.getByText(s.journals.invoice.number).filter({ visible: true })).toBeVisible();
  // Lists render a table (md+) and phone cards; check the visible one.
  await expect(main.getByText(s.journals.reversal.number).filter({ visible: true })).toBeVisible();
  main = await open(page, s.urls.journalDetail);
  await expect(main.getByText(s.journals.invoice.number).first()).toBeVisible();
  main = await open(page, '/admin/accounting/trial-balance');
  await expect(main.getByText('Accounts Receivable').first()).toBeVisible();
  main = await open(page, '/admin/accounting/profit-loss');
  await expect(main.getByText('Recruitment Revenue').first()).toBeVisible();
  main = await open(page, '/admin/accounting/balance-sheet');
  await expect(main.getByText('Bank Accounts').first()).toBeVisible();
  main = await open(page, '/admin/accounting/vat');
  await expect(main.getByText(/230\.00/).first()).toBeVisible();
});
