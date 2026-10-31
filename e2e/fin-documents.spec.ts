import { expect, type Page, test } from '@playwright/test';
import { type FinanceScenario, seedFinanceScenario } from './helpers/finance-fixtures';

/**
 * F2 — Stage 6G invoice and receipt pages (candidate + employer payers).
 * Phone / tablet / desktop: no sideways overflow inside the app, no table
 * cut off by its card, header + total + actions on screen. Tabs follow
 * `?tab=` and the keyboard; back links go to the payer's Billing tab;
 * print media shows only the document, edge to edge.
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

const WIDTHS = [
  ['phone', 390, 844],
  ['tablet', 820, 1000],
  ['desktop', 1440, 1000],
] as const;

type Doc = { name: string; url: () => string | null; kind: 'invoice' | 'receipt' };
const DOCS: Doc[] = [
  { name: 'employer invoice (paid)', url: () => s.urls.employerInvoice, kind: 'invoice' },
  { name: 'employer invoice (part paid)', url: () => s.urls.employerPartInvoice, kind: 'invoice' },
  { name: 'employer receipt', url: () => s.urls.employerReceipt, kind: 'receipt' },
  { name: 'candidate invoice', url: () => s.urls.candidateInvoice, kind: 'invoice' },
  { name: 'candidate receipt', url: () => s.urls.candidateReceipt, kind: 'receipt' },
];

async function layoutMetrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement;
    let clipped = 0;
    for (const t of Array.from(document.querySelectorAll('table'))) {
      let a = t.parentElement;
      while (a && a !== document.body && getComputedStyle(a).overflowX === 'visible') {
        a = a.parentElement;
      }
      if (!a || a === document.body) continue;
      const ox = getComputedStyle(a).overflowX;
      if (ox !== 'auto' && ox !== 'scroll' && t.scrollWidth > a.clientWidth + 1) clipped++;
    }
    return { overflowX: main.scrollWidth - main.clientWidth, clipped };
  });
}

/** The element's box lies within the viewport horizontally. */
async function expectOnScreen(page: Page, locator: ReturnType<Page['locator']>, what: string) {
  const box = await locator.boundingBox();
  expect(box, what).not.toBeNull();
  const vw = page.viewportSize()?.width ?? 0;
  expect(box?.x ?? -1, `${what} left edge`).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0), `${what} right edge`).toBeLessThanOrEqual(vw + 1);
}

for (const doc of DOCS) {
  test(`${doc.name}: fits phone, tablet and desktop`, async ({ page }) => {
    const url = doc.url();
    test.skip(!url, 'no such record in this database');
    for (const [label, width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      const r = await page.goto(url as string, { waitUntil: 'networkidle' });
      expect(r?.status()).toBe(200);
      const m = await layoutMetrics(page);
      expect(m.overflowX, `${label}: sideways overflow`).toBe(0);
      expect(m.clipped, `${label}: tables cut off`).toBe(0);

      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toContainText(doc.kind === 'invoice' ? 'Invoice' : 'Receipt');
      await expectOnScreen(page, h1, `${label}: heading`);
      await expectOnScreen(page, page.getByRole('button', { name: /print/i }), `${label}: print`);
      const docEl = page.getByRole('article', {
        name: doc.kind === 'invoice' ? 'Invoice document' : 'Receipt document',
      });
      await expectOnScreen(page, docEl, `${label}: document`);
      const total = docEl.getByText(doc.kind === 'invoice' ? 'Total Due' : 'Amount Received');
      await total.scrollIntoViewIfNeeded();
      await expectOnScreen(page, total, `${label}: total`);
    }
  });
}

test('employer invoice: back link, tabs follow keyboard and ?tab=, receipt link opens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(s.urls.employerInvoice, { waitUntil: 'networkidle' });
  await expect(page.getByRole('link', { name: 'Back to billing' })).toHaveAttribute(
    'href',
    `/employers/${s.employerId}?tab=billing`,
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText(s.paidInvoice.invoiceNumber);
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  const overview = page.getByRole('tab', { name: 'Overview' });
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await overview.focus();
  await page.keyboard.press('ArrowRight');
  const paymentsTab = page.getByRole('tab', { name: /^Payments \(\d+\)$/ });
  await expect(paymentsTab).toBeFocused();
  await expect(paymentsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/[?&]tab=payments/);
  await expect(page.getByRole('tabpanel')).toBeVisible();

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('tab', { name: /^Payments/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const receiptLink = page.getByRole('link', {
    name: `Open receipt ${s.paidInvoice.receiptNumber}`,
  });
  await expect(receiptLink).toHaveAttribute(
    'href',
    `/employers/${s.employerId}/receipts/${s.paidInvoice.receiptNumber}`,
  );

  await page.getByRole('tab', { name: 'Related records' }).click();
  await expect(page).toHaveURL(/[?&]tab=related/);
  // Repeated "Open" links carry the record they open.
  await expect(page.getByRole('link', { name: 'Open Employer workspace' })).toHaveAttribute(
    'href',
    `/employers/${s.employerId}?tab=billing`,
  );
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page).not.toHaveURL(/[?&]tab=/);

  const r = await page.goto(`/employers/${s.employerId}/receipts/${s.paidInvoice.receiptNumber}`);
  expect(r?.status()).toBe(200);
  await expect(page.getByRole('link', { name: 'Back to billing' })).toHaveAttribute(
    'href',
    `/employers/${s.employerId}?tab=billing`,
  );
  await expect(
    page.getByRole('link', { name: `Open invoice ${s.paidInvoice.invoiceNumber}` }),
  ).toHaveAttribute('href', s.urls.employerInvoice);
});

test('candidate invoice and receipt: back links go to the client Billing tab', async ({ page }) => {
  test.skip(!s.urls.candidateInvoice, 'no candidate invoice in this database');
  const personId = (s.urls.candidateInvoice as string).split('/')[2];
  await page.goto(s.urls.candidateInvoice as string, { waitUntil: 'networkidle' });
  await expect(page.getByRole('link', { name: 'Back to billing' })).toHaveAttribute(
    'href',
    `/clients/${personId}?tab=services-billing`,
  );
  await page.goto(`${s.urls.candidateInvoice}?tab=related`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('tab', { name: 'Related records' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('link', { name: 'Open Candidate workspace' })).toBeVisible();
  if (s.urls.candidateReceipt) {
    await page.goto(s.urls.candidateReceipt, { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: 'Back to billing' })).toHaveAttribute(
      'href',
      `/clients/${personId}?tab=services-billing`,
    );
  }
});

test('print media shows only the document, edge to edge, on every tab', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${s.urls.employerInvoice}?tab=related`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  const docEl = page.getByRole('article', { name: 'Invoice document' });
  await expect(docEl).toBeVisible();
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
  const box = await docEl.boundingBox();
  expect(box?.x ?? -1).toBeLessThanOrEqual(1);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(1430);
});
