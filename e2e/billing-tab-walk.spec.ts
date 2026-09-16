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

test('billing tab: leads → click person → Billing tab lists invoices', async ({ page }) => {
  // 1. Land on /leads and screenshot the (now-linky) person cell.
  await page.goto('/leads', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1, name: /leads/i })).toBeVisible();
  await shot(page, 'e2e__billing-tab-01-leads-list');

  // 2. Click the first person's name → should navigate to /candidates/[id].
  const firstPersonLink = page.locator('a[href^="/candidates/"]').first();
  const rows = await firstPersonLink.count();
  test.skip(rows === 0, 'no lead rows in DB — seed with pnpm tsx scripts/seed-billing-fixtures.ts');
  await firstPersonLink.click();
  await page.waitForURL(/\/candidates\/[0-9a-f-]+/i);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'e2e__billing-tab-02-profile-landed');

  // 3. Click the Billing tab → confirm the list surface (or the empty state).
  await page.getByRole('tab', { name: /^billing$/i }).click();
  await expect(page.getByText(/billing history/i)).toBeVisible();
  await shot(page, 'e2e__billing-tab-03-billing-tab');

  // 4. If invoices exist, click the first "Open" → land on printable invoice.
  const openLink = page.locator('a[href*="/invoices/INV-"]').first();
  if (await openLink.count()) {
    await openLink.click();
    await page.waitForURL(/\/invoices\/INV-/);
    await expect(page.getByText(/^INVOICE$/)).toBeVisible();
    await shot(page, 'e2e__billing-tab-04-invoice-from-tab');
  }
});
