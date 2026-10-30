import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 4 — full Candidate Services flow walkthrough.
 *
 *   1. Open an existing CS lead (via /leads/[id] which lands on the
 *      pro-forma panel).
 *   2. Verify the Filter control is present in the toolbar (replacing
 *      the old Columns dropdown).
 *   3. Open the composer, create a 2-line pro forma.
 *   4. Issue + Accept.
 *   5. Record + Verify payment that fully covers → auto-issues the
 *      official invoice.
 *   6. The "Convert → activate candidate" row action completes the
 *      lead-to-candidate materialisation without creating a duplicate
 *      payment (the PF-origin guard).
 *   7. View the candidate billing history and confirm the PF-issued
 *      invoice is present.
 *
 * The expiry + reactivation flow is covered by the DB tests in
 * src/modules/leads/expiry.test.ts — exercising it in the browser
 * would need to backdate created_at via raw SQL, which is a scripted
 * concern.
 */

const SHOTS_DIR = path.resolve('playwright/stage4-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function openFirstCsLead(page: Page): Promise<string> {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { db } = await import('../src/lib/db/client');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { persons } = await import('../src/lib/db/schema/persons');
  // Self-seed a fresh person + CS lead: earlier suites in the same run
  // convert every seeded lead, so querying for an unconverted one is
  // order-dependent and starves on CI's fresh database.
  const rand = Math.random().toString(36).slice(2, 7);
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'E2EQuote',
      lastName: `Lead-${rand}`,
      email: `e2e-quote-${Date.now()}-${rand}@example.test`,
      phone: '+353871230000',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('could not seed person');
  const [lead] = await db
    .insert(leads)
    .values({
      assignedUserId: await e2eAdminId(),
      personId: p.id,
      targetBusiness: 'CANDIDATE_SERVICES',
      status: 'NEW',
    })
    .returning({ id: leads.id });
  if (!lead) throw new Error('could not seed CS lead');
  // Stage 6D — person-linked leads redirect to the Client Workspace,
  // whose Services & Billing surface hosts the quote lifecycle.
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('heading', { name: /Service billing/i }).first()).toBeVisible({
    timeout: 10_000,
  });
  return lead.id;
}

test.describe('Stage 4 — full CS workflow', () => {
  test('leads page shows Filter control (Columns dropdown removed)', async ({ page }) => {
    await page.goto('/leads?assigned=all');
    await expect(page.getByRole('heading', { name: /^Leads$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Filter/ })).toBeVisible();
    // The old Columns dropdown should no longer appear.
    await expect(page.getByRole('button', { name: /^Columns$/ })).toHaveCount(0);
    await shot(page, '01-leads-filter-control');
  });

  test('filter dropdown applies status + source + country + active-only', async ({ page }) => {
    await page.goto('/leads?assigned=all');
    await page.getByRole('button', { name: /^Filter/ }).click();
    // Status label inside the dropdown (the table also has a Status column
    // header, so scope to the dropdown's "Active only" button to confirm
    // it rendered before clicking).
    await expect(page.getByRole('button', { name: 'Active only' })).toBeVisible();
    await shot(page, '02-filter-open');
    await page.getByRole('button', { name: 'Active only' }).click();
    await expect(page).toHaveURL(/active=true/);
    await shot(page, '03-active-only-filter-applied');
    // Clear + close
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page).not.toHaveURL(/active=true/);
  });

  test('full CS workflow: pro forma → partial payment → invoice → lead detail', async ({
    page,
  }) => {
    await openFirstCsLead(page);

    // Per-run unique line price so this run's quote card is unambiguous.
    const pA = 150 + (Date.now() % 40) + 0.41;
    const total = `€${(pA + 2 * 75).toFixed(2)}`;

    // Create a 2-line pro forma from the workspace's + New quote.
    await page.getByRole('button', { name: '+ New quote' }).first().click();
    await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Stage 4 — Service A');
    const q = page.locator('input[inputmode="decimal"]');
    await q.nth(0).fill('1');
    await q.nth(1).fill(pA.toFixed(2));
    await page.getByRole('button', { name: /^Add line$/ }).click();
    await page.getByPlaceholder('Appears on the PDF line').nth(1).fill('Stage 4 — Add-on');
    const q2 = page.locator('input[inputmode="decimal"]');
    await q2.nth(2).fill('2');
    await q2.nth(3).fill('75.00');
    await expect(page.getByText(total).first()).toBeVisible();
    await shot(page, '04-pf-composer-two-lines');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created').first()).toBeVisible();

    // Issue + accept inline on the workspace quote card.
    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Pending quote' })
      .filter({ hasText: total })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Issue' }).click();
    await expect(card.getByText('Quote issued')).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Record client acceptance' }).click();
    await page.getByPlaceholder('Required for the audit log').fill('Stage 4 happy path');
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(card.getByText('Client accepted')).toBeVisible({ timeout: 10_000 });
    await shot(page, '05-pf-accepted');

    // Record + verify a payment that fully pays — triggers invoice issuance.
    await card.getByRole('button', { name: 'Record payment' }).click();
    await page.getByLabel(/^Amount \(EUR\)$/).fill((pA + 150).toFixed(2));
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    // Stage C workflow collapse — an ADMIN's full payment verifies and
    // issues the official invoice in the same action; the toast carries
    // the INV number and no per-payment Verify button remains.
    await expect(page.getByText(/invoice INV-\S+ issued/)).toBeVisible({
      timeout: 10_000,
    });
    const eng = page.locator('[data-testid="engagement-card"]').filter({ hasText: total }).first();
    await expect(eng).toBeVisible({ timeout: 10_000 });
    if ((await eng.locator('details').getAttribute('open')) === null) {
      await eng.locator('summary').first().click();
    }
    expect(await eng.getByRole('button', { name: 'Verify' }).count()).toBe(0);
    await shot(page, '06-pf-converted-invoice-issued');

    // The refresh may have re-collapsed the engagement card; expand it
    // again, then follow its same-tab "View invoice" link to the ICG
    // print template.
    if ((await eng.locator('details').getAttribute('open')) === null) {
      await eng.locator('summary').first().click();
    }
    await eng.getByRole('link', { name: 'View invoice' }).first().click();
    await page.waitForURL(/\/candidates\/[^/]+\/invoices\/INV-/, { timeout: 15_000 });
    await expect(page.getByText('Stage 4 — Service A')).toBeVisible();
    await expect(page.getByText('Stage 4 — Add-on')).toBeVisible();
    await expect(page.getByText(total).first()).toBeVisible();
    await shot(page, '07-pf-print-pdf');
  });
});
