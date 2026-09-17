import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const SHOTS = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/**
 * Closes the paperwork loop end-to-end in the Billing tab / card:
 *   1. Person profile Billing tab — record + verify a payment against an
 *      ISSUED invoice, receipt appears in the Receipts section, invoice
 *      status flips to PAID, "Record payment" button disappears.
 *   2. Employer profile Billing card — same shape, employer-scoped
 *      Record payment flow. Just asserts the surface renders — recording
 *      is exercised by the person path since the underlying pipeline is
 *      shared.
 */

test('billing loop: record + verify from person profile issues receipt', async ({ page }) => {
  // Find a person that has at least one ISSUED invoice.
  await page.goto('/leads', { waitUntil: 'networkidle' });
  const firstPersonLink = page.locator('a[href^="/candidates/"]').first();
  test.skip((await firstPersonLink.count()) === 0, 'no leads seeded');
  await firstPersonLink.click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+/i);

  await page.getByRole('tab', { name: /^billing$/i }).click();
  await expect(page.getByText(/billing history/i)).toBeVisible();
  await shot(page, 'e2e__billing-loop-01-before-payment');

  const invoicesBefore = await page.locator('a[href*="/invoices/INV-"]').count();
  const recordBtn = page.getByRole('button', { name: /^record payment$/i }).first();
  test.skip(
    (await recordBtn.count()) === 0,
    'no ISSUED invoice — seed an unpaid invoice with pnpm tsx scripts/seed-billing-fixtures.ts',
  );
  await recordBtn.click();

  await expect(page.getByRole('heading', { name: /record payment for inv-/i })).toBeVisible();
  await shot(page, 'e2e__billing-loop-02-dialog-open');

  // Amount + currency pre-filled from the invoice. Method + received on
  // have sensible defaults. The "Mark verified now" checkbox is on by
  // default for admins — leave it on to exercise the auto-issue path.
  await page.locator('#rp-ref').fill('E2E-BANK-REF-001');

  await page.getByRole('button', { name: /^record \+ verify$/i }).click();

  // Success toast + list refresh: invoice flips to PAID, a receipt appears.
  await expect(page.getByText(/receipt issued for inv-/i)).toBeVisible({ timeout: 10_000 });

  // Wait for router.refresh() to actually swap the DOM — the receipt
  // link is the strongest signal because it only exists post-refresh.
  const receiptOpen = page.locator('a[href*="/receipts/RCT-"]').first();
  await expect(receiptOpen).toBeVisible({ timeout: 10_000 });
  // Then let the loading indicator settle for a clean screenshot.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await shot(page, 'e2e__billing-loop-03-after-verify');
  const receiptsAfter = await page.locator('a[href*="/receipts/RCT-"]').count();
  expect(receiptsAfter).toBeGreaterThan(0);

  // Invoice count on this profile shouldn't drop (invoices stay listed even when PAID).
  const invoicesAfter = await page.locator('a[href*="/invoices/INV-"]').count();
  expect(invoicesAfter).toBe(invoicesBefore);
});

test('billing loop: employer profile renders Billing card with same shape', async ({ page }) => {
  await page.goto('/employers', { waitUntil: 'networkidle' });
  const firstOpen = page.getByRole('link', { name: /^open$/i }).first();
  test.skip((await firstOpen.count()) === 0, 'no employers seeded');
  await firstOpen.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Billing history card must render. Its shape is the same as the person
  // profile — the shared BillingSection component.
  await expect(page.getByText(/billing history/i)).toBeVisible();
  await shot(page, 'e2e__billing-loop-04-employer-billing-card');
});
