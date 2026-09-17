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
 * /documents hub — two-level nav.
 *   1. Landing view is a grid of client folders (one per person /
 *      employer that owns any artifact).
 *   2. Clicking a folder drops into `/documents?client=<id>&type=<...>`
 *      which shows all of that client's uploaded docs, invoices, and
 *      receipts in one table.
 *   3. Kind filter (Uploaded / Invoices / Receipts) works inside the
 *      folder.
 *   4. Opening an invoice row goes straight to the printable page.
 */

test('01 · Landing renders the folder grid', async ({ page }) => {
  await page.goto('/documents', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: /^documents$/i })).toBeVisible();
  await expect(page.getByText(/one folder per client/i)).toBeVisible();
  await shot(page, 'e2e__docs-hub-01-folders');
});

test('02 · Clicking a folder drops into that client', async ({ page }) => {
  await page.goto('/documents', { waitUntil: 'networkidle' });
  const firstFolder = page.locator('a[href*="/documents?client="]').first();
  test.skip((await firstFolder.count()) === 0, 'no client folders yet — seed some data');
  const folderName = (await firstFolder.locator('p').first().textContent())?.trim() ?? '';
  await firstFolder.click();
  await page.waitForURL(/\/documents\?client=/);
  // Folder title should be the client's name from the card.
  if (folderName) {
    await expect(page.getByRole('heading', { level: 1, name: folderName })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /all clients/i })).toBeVisible();
  await shot(page, 'e2e__docs-hub-02-folder-contents');
});

test('03 · Kind filter narrows the inside-folder table', async ({ page }) => {
  await page.goto('/documents', { waitUntil: 'networkidle' });
  const firstFolder = page.locator('a[href*="/documents?client="]').first();
  test.skip((await firstFolder.count()) === 0, 'no folders');
  await firstFolder.click();
  await page.waitForURL(/\/documents\?client=/);

  await page.getByRole('button', { name: /^invoices$/i }).click();
  await page.waitForURL(/kind=INVOICE/);
  const otherKindBadges = page.getByText(/^(FILE|RECEIPT)$/);
  expect(await otherKindBadges.count()).toBe(0);
  await shot(page, 'e2e__docs-hub-03-invoices-in-folder');
});

test('04 · Open button on an invoice row goes to the printable page', async ({ page }) => {
  await page.goto('/documents', { waitUntil: 'networkidle' });
  const firstFolder = page.locator('a[href*="/documents?client="]').first();
  test.skip((await firstFolder.count()) === 0, 'no folders');
  await firstFolder.click();
  await page.waitForURL(/\/documents\?client=/);
  await page.getByRole('button', { name: /^invoices$/i }).click();
  await page.waitForURL(/kind=INVOICE/);

  const openLink = page.getByRole('link', { name: /^open/i }).first();
  test.skip((await openLink.count()) === 0, 'no invoices for this client');
  const href = await openLink.getAttribute('href');
  expect(href).toMatch(/\/invoices\/INV-/);
  await page.goto(href ?? '', { waitUntil: 'networkidle' });
  await expect(page.getByText(/^INVOICE$/)).toBeVisible();
  await shot(page, 'e2e__docs-hub-04-invoice-open');
});

test('05 · Back-to-all-clients returns to the folder grid', async ({ page }) => {
  await page.goto('/documents', { waitUntil: 'networkidle' });
  const firstFolder = page.locator('a[href*="/documents?client="]').first();
  test.skip((await firstFolder.count()) === 0, 'no folders');
  await firstFolder.click();
  await page.waitForURL(/\/documents\?client=/);
  await page.getByRole('link', { name: /all clients/i }).click();
  await page.waitForURL(/\/documents$/);
  await expect(page.getByText(/one folder per client/i)).toBeVisible();
});
