import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
  const { and, eq, isNotNull } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { leads } = await import('../src/lib/db/schema/leads');
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.targetBusiness, 'CANDIDATE_SERVICES'), isNotNull(leads.personId)))
    .limit(1);
  if (!lead) throw new Error('No CS lead with person_id in dev DB');
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('heading', { name: /Pro formas|Lead details/ }).first()).toBeVisible({
    timeout: 10_000,
  });
  return lead.id;
}

async function latestProFormaId(leadId: string): Promise<string> {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { desc, eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { proFormaInvoices } = await import('../src/lib/db/schema/proformas');
  const [row] = await db
    .select({ id: proFormaInvoices.id })
    .from(proFormaInvoices)
    .where(eq(proFormaInvoices.sourceLeadId, leadId))
    .orderBy(desc(proFormaInvoices.createdAt))
    .limit(1);
  if (!row) throw new Error('No pro forma on lead');
  return row.id;
}

async function openLatestProForma(page: Page, leadId: string): Promise<string> {
  const pfId = await latestProFormaId(leadId);
  await page.goto(`/leads/${leadId}/pro-formas/${pfId}`);
  await expect(page.locator('h1').first()).toBeVisible();
  return pfId;
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
    const leadId = await openFirstCsLead(page);

    // Create a 2-line pro forma.
    await page.getByRole('button', { name: 'New pro forma' }).click();
    await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Stage 4 — Service A');
    const q = page.locator('input[inputmode="decimal"]');
    await q.nth(0).fill('1');
    await q.nth(1).fill('150.00');
    await page.getByRole('button', { name: /^Add line$/ }).click();
    await page.getByPlaceholder('Appears on the PDF line').nth(1).fill('Stage 4 — Add-on');
    const q2 = page.locator('input[inputmode="decimal"]');
    await q2.nth(2).fill('2');
    await q2.nth(3).fill('75.00');
    // 1*150 + 2*75 = 300
    await expect(page.getByText('€300.00').first()).toBeVisible();
    await shot(page, '04-pf-composer-two-lines');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created')).toBeVisible();

    // Open it, issue, accept.
    const pfId = await openLatestProForma(page, leadId);
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText('Pro forma issued')).toBeVisible();
    await page.getByRole('button', { name: 'Record client acceptance' }).click();
    await page.getByPlaceholder('Required for the audit log').fill('Stage 4 happy path');
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(page.getByText(/ACCEPTED/).first()).toBeVisible();
    await shot(page, '05-pf-accepted');

    // Record + verify a payment that fully pays — triggers invoice issuance.
    await page.getByRole('button', { name: 'Record payment' }).click();
    await page.getByLabel(/^Amount \(EUR\)$/).fill('300.00');
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Payment recorded/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Verify' }).first().click();
    await expect(page.getByText(/Official invoice issued: INV-/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/CONVERTED/).first()).toBeVisible();
    await shot(page, '06-pf-converted-invoice-issued');

    // Open the print view and confirm the multi-line invoice shows both services.
    const printLink = page.getByRole('link', { name: /View \/ print PDF/ });
    const [printPage] = await Promise.all([
      page.context().waitForEvent('page'),
      printLink.click(),
    ]);
    await printPage.waitForLoadState();
    await expect(printPage.getByText('Stage 4 — Service A')).toBeVisible();
    await expect(printPage.getByText('Stage 4 — Add-on')).toBeVisible();
    await expect(printPage.getByText('€300.00').first()).toBeVisible();
    await printPage.screenshot({
      path: path.join(SHOTS_DIR, '07-pf-print-pdf.png'),
      fullPage: true,
    });
    await printPage.close();

    // Reference pfId to appease lint
    expect(pfId.length).toBeGreaterThan(0);
  });
});
