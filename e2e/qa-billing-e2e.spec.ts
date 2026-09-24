import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * End-to-end billing sweep — walk EVERY screen the operator touches
 * to issue an invoice, so I can eyeball the visual output at each
 * step. Per memory `walk-flow-before-declaring-done`: this is the
 * mandatory visual review pass. Tests passing != looks professional.
 *
 * Flows covered:
 *   1. /admin/settings — letterhead editor (including new VAT rate).
 *   2. /leads — list rendered with the redesigned row actions
 *      (context-primary button + trimmed overflow).
 *   3. "New lead" → dialog with optional first-invoice block →
 *      atomic create + navigate to printable invoice + PDF.
 *   4. /employers/[id] — header "Generate invoice" button → dialog
 *      with new QTY / unit price / currency fields (all editable) →
 *      manual-price path (Work Permit) → invoice + PDF.
 *   5. Existing receipt printable + PDF (proves the receipt template
 *      redesign works with legacy seed data).
 *
 * Artifacts land in ./screenshots/ (PNG) and ./artifacts/ (PDF).
 */

const SHOTS = path.join(process.cwd(), 'screenshots');
const ARTIFACTS = path.join(process.cwd(), 'artifacts');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(ARTIFACTS)) fs.mkdirSync(ARTIFACTS, { recursive: true });

async function fullShot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function pdfIt(page: Page, name: string) {
  const pdfPath = path.join(ARTIFACTS, `${name}.pdf`);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
  });
  await page.emulateMedia({ media: null });
}

test('01 · /admin/settings renders the letterhead editor', async ({ page }) => {
  await page.goto('/admin/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: /company settings/i })).toBeVisible();
  // New VAT rate field must be visible for the owner to edit.
  await expect(page.getByLabel(/vat rate/i)).toBeVisible();
  await fullShot(page, 'e2e__settings');
});

test('02 · /leads renders with the redesigned row actions', async ({ page }) => {
  await page.goto('/leads', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: /leads/i })).toBeVisible();
  await fullShot(page, 'e2e__leads-list');
});

test('03 · New lead + first invoice atomic flow', async ({ page }) => {
  await page.goto('/leads', { waitUntil: 'networkidle' });

  const newLead = page.getByRole('button', { name: /^new lead$/i });
  await expect(newLead).toBeVisible();
  await newLead.click();
  await expect(page.getByRole('heading', { name: /create a new lead/i })).toBeVisible();
  await fullShot(page, 'e2e__new-lead-dialog-empty');

  // Fill in the person section. Randomise the email to avoid unique
  // collisions when re-running against the same DB.
  const stamp = Date.now();
  await page.locator('#cl-first').fill('Priya');
  await page.locator('#cl-last').fill(`Sharma-${stamp}`);
  await page.locator('#cl-email').fill(`priya.sharma+${stamp}@example.ie`);
  await page.locator('#cl-phone').fill('+353 87 555 0100');
  await page.locator('#cl-country').fill('Ireland');
  await page.locator('#cl-city').fill('Dublin');

  // Pick a service via the CatalogAutosuggest — it's an <input> with
  // a dropdown, NOT a <select>. Keyboard flow: focus → type → Enter
  // selects the first catalog match at highlight=0.
  //
  // Important: use "Info Session", not "Work Permit". Work Permit's
  // seed has an empty packages: [] array, so no package selector
  // renders, unitPrice never gets auto-filled, and invoiceIsValid
  // stays false — the submit button title never flips to include
  // "+ issue invoice". Info Session has EUR + ZAR packages that
  // populate unitPrice on selection.
  const svcInput = page.locator('#cl-svc');
  await svcInput.click();
  await svcInput.pressSequentially('info session', { delay: 30 });
  await page.waitForTimeout(200);
  await svcInput.press('Enter');
  await expect(svcInput).toHaveValue(/Info Session/i);

  // Optional package selector — kept as a <select> for now.
  const pkgSelect = page.locator('#cl-pkg');
  if (await pkgSelect.count()) {
    const opts = await pkgSelect.locator('option').all();
    if (opts.length > 1) {
      const v = await opts[1]?.getAttribute('value');
      if (v) await pkgSelect.selectOption(v);
    }
  }
  await page.locator('#cl-qty').fill('2');
  await fullShot(page, 'e2e__new-lead-dialog-filled');

  await page.getByRole('button', { name: /create lead \+ issue invoice/i }).click();

  // Redirect lands on /candidates/[id]/invoices/INV-YYYY-NNNNNN.
  await page.waitForURL(/\/candidates\/[^/]+\/invoices\/INV-/, { timeout: 20_000 });
  // The big INVOICE title from the ICG template must be visible.
  await expect(page.getByText(/^INVOICE$/)).toBeVisible();
  await fullShot(page, 'e2e__lead-invoice-print');
  await pdfIt(page, 'e2e__lead-invoice');
});

test('04 · Employer invoice — dialog + manual price flow', async ({ page }) => {
  await page.goto('/employers', { waitUntil: 'networkidle' });
  const firstOpenLink = page.getByRole('link', { name: /^open$/i }).first();
  test.skip((await firstOpenLink.count()) === 0, 'no employers in the DB');
  await firstOpenLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.getByRole('button', { name: /generate invoice/i }).click();
  await expect(page.getByRole('heading', { name: /generate invoice/i })).toBeVisible();
  await fullShot(page, 'e2e__employer-invoice-dialog');

  const emptyStateVisible = await page
    .getByText(/no active employer services/i)
    .isVisible()
    .catch(() => false);
  if (emptyStateVisible) {
    test.info().annotations.push({
      type: 'note',
      description: 'No employer-payable services in catalog — seed one via /admin/services.',
    });
    return;
  }

  // Prefill from a package if available, else manual-price path.
  const pkgSelect = page.locator('#pkg');
  const pkgAvailable = (await pkgSelect.count()) > 0;
  if (pkgAvailable) {
    const opts = await pkgSelect.locator('option').all();
    if (opts.length > 1) {
      const v = await opts[1]?.getAttribute('value');
      if (v) await pkgSelect.selectOption(v);
    }
  } else {
    // WORK_PERMIT_APPLICATION is payerType=ANY with no packages —
    // enter unit price manually to prove the editable-amount flow.
    await page.locator('#unitPrice').fill('250.00');
  }

  await page.getByRole('button', { name: /^generate invoice$/i }).click();
  await page.waitForURL(/\/employers\/[^/]+\/invoices\/INV-/, { timeout: 20_000 });
  await expect(page.getByText(/^INVOICE$/)).toBeVisible();
  await fullShot(page, 'e2e__employer-invoice-print');
  await pdfIt(page, 'e2e__employer-invoice');
});

test('05 · Existing receipt renders in the new template + PDF', async ({ page }) => {
  await page.goto('/payments', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: /payments/i })).toBeVisible();

  const { desc } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { receipts } = await import('../src/lib/db/schema/billing');
  const [receipt] = await db
    .select({
      number: receipts.number,
      personId: receipts.payerPersonId,
      employerId: receipts.payerEmployerId,
    })
    .from(receipts)
    .orderBy(desc(receipts.issuedAt))
    .limit(1);
  test.skip(!receipt, 'no receipts in DB');
  if (!receipt) return;

  const url =
    receipt.personId !== null
      ? `/candidates/${receipt.personId}/receipts/${receipt.number}`
      : `/employers/${receipt.employerId}/receipts/${receipt.number}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await expect(page.getByText(/^RECEIPT$/)).toBeVisible();
  await fullShot(page, 'e2e__receipt-print');
  await pdfIt(page, 'e2e__receipt');
});
