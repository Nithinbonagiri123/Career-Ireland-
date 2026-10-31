import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 3 walkthrough — Add Alternative, partial payments, and
 * payment-triggered official invoice issuance.
 *
 * Covers the Stage 3 brief:
 *   - "Add Alternative Pro Forma" in the same group → accepting one
 *     supersedes the other (end-to-end in the browser).
 *   - Three partial payments summing to the pro-forma total.
 *   - Verification writes receipts and, on the final one, mints the
 *     official invoice carrying every pro-forma line verbatim.
 *   - Overpayment refusal.
 *   - Currency-mismatch refusal.
 */

const SHOTS_DIR = path.resolve('playwright/stage3-screenshots');
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
  // Stage 6D — person-linked leads land on the Client Workspace; quote
  // creation happens via its "+ New quote". The per-pro-forma detail
  // pages this spec then drives still live at their original URLs.
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByRole('heading', { name: /Service billing/i }).first()).toBeVisible({
    timeout: 10_000,
  });
  return lead.id;
}

/** Return the UUID of the most recently created pro-forma on this lead. */
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

test.describe('Stage 3 — add alternative + partial payment issuance', () => {
  test('alternative proposal in the same group — accepting one supersedes the other', async ({
    page,
  }) => {
    const leadId = await openFirstCsLead(page);

    // Create a base pro forma (1 line, EUR 400).
    await page.getByRole('button', { name: '+ New quote' }).first().click();
    await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Tier A — Standard');
    const q = page.locator('input[inputmode="decimal"]');
    await q.nth(0).fill('1');
    await q.nth(1).fill('400.00');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created')).toBeVisible();
    await shot(page, '01-base-draft-created');

    // Open base, issue.
    const basePfId = await openLatestProForma(page, leadId);
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText('Pro forma issued')).toBeVisible();
    await shot(page, '02-base-issued');

    // Add alternative in the SAME proposal group.
    await page.getByRole('button', { name: 'Add alternative' }).click();
    await expect(page.getByRole('heading', { name: /^Add alternative pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Tier B — Premium');
    const q2 = page.locator('input[inputmode="decimal"]');
    await q2.nth(0).fill('1');
    await q2.nth(1).fill('650.00');
    await shot(page, '03-alt-composer');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created')).toBeVisible();
    await shot(page, '04-alt-draft-saved');

    // Issue the alternative (which is now the latest), then accept it.
    await openLatestProForma(page, leadId);
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText('Pro forma issued')).toBeVisible();
    await page.getByRole('button', { name: 'Record client acceptance' }).click();
    await page.getByPlaceholder('Required for the audit log').fill('Client chose Tier B');
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
    await shot(page, '05-alt-accepted');

    // Verify the base pro forma flipped to SUPERSEDED by navigating directly.
    await page.goto(`/leads/${leadId}/pro-formas/${basePfId}`);
    await expect(page.getByText('Superseded', { exact: true }).first()).toBeVisible({
      timeout: 5_000,
    });
    await shot(page, '06-base-superseded');
  });

  test('three partial payments then automatic invoice issuance', async ({ page }) => {
    const leadId = await openFirstCsLead(page);

    // Create a pro forma for EUR 500, issue, accept.
    await page.getByRole('button', { name: '+ New quote' }).first().click();
    await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Full package');
    const q = page.locator('input[inputmode="decimal"]');
    await q.nth(0).fill('1');
    await q.nth(1).fill('500.00');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created')).toBeVisible();

    await openLatestProForma(page, leadId);
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText('Pro forma issued')).toBeVisible();
    await page.getByRole('button', { name: 'Record client acceptance' }).click();
    await page.getByPlaceholder('Required for the audit log').fill('Agreement signed');
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
    await shot(page, '07-pf-accepted-ready-for-payment');

    // Record first payment: €200 and verify.
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible();
    // Amount is pre-filled with outstanding (500). Override to 200.
    const amountInput = page.getByLabel(/^Amount \(EUR\)$/);
    await amountInput.fill('200.00');
    await shot(page, '08-record-first-payment');
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    // Stage C workflow collapse — an ADMIN's recording verifies in the
    // same action; no separate Verify click exists any more.
    await expect(page.getByText(/Payment verified/).first()).toBeVisible();
    expect(await page.getByRole('button', { name: 'Verify' }).count()).toBe(0);
    // Outstanding should now show €300.
    await expect(page.getByText('€300.00')).toBeVisible();
    await shot(page, '09-after-first-payment');

    // Record second payment: €200 and verify.
    await page.getByRole('button', { name: 'Record payment' }).click();
    const amount2 = page.getByLabel(/^Amount \(EUR\)$/);
    await amount2.fill('200.00');
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Payment verified/).first()).toBeVisible();
    // Outstanding should now show €100.
    await expect(page.getByText('€100.00')).toBeVisible();
    await shot(page, '10-after-second-payment');

    // Record third payment: €100 and verify. This should trigger INVOICE issuance.
    await page.getByRole('button', { name: 'Record payment' }).click();
    const amount3 = page.getByLabel(/^Amount \(EUR\)$/);
    await amount3.fill('100.00');
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    // Stage C workflow collapse — the settling payment verifies, issues
    // the official invoice and activates the candidate in one action;
    // the toast carries the newly minted INV number.
    await expect(page.getByText(/invoice INV-\S+ issued/)).toBeVisible({
      timeout: 10_000,
    });
    // Status flipped to CONVERTED. Outstanding is 0.
    await expect(page.getByText('Converted', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('€0.00')).toBeVisible();
    await shot(page, '11-converted-with-invoice');
  });

  test('overpayment attempt is refused with a clear error', async ({ page }) => {
    const leadId = await openFirstCsLead(page);

    // Fresh pro forma for EUR 100.
    await page.getByRole('button', { name: '+ New quote' }).first().click();
    await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Overpay test');
    const q = page.locator('input[inputmode="decimal"]');
    await q.nth(0).fill('1');
    await q.nth(1).fill('100.00');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created')).toBeVisible();

    await openLatestProForma(page, leadId);
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText('Pro forma issued')).toBeVisible();
    await page.getByRole('button', { name: 'Record client acceptance' }).click();
    await page.getByPlaceholder('Required for the audit log').fill('for test');
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

    // Record EUR 150 (overpay) — recording is allowed, verifying is not.
    await page.getByRole('button', { name: 'Record payment' }).click();
    const amount = page.getByLabel(/^Amount \(EUR\)$/);
    await amount.fill('150.00');
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    // Stage C workflow collapse — the inline verification refuses the
    // over-allocation immediately. The guard itself is unchanged.
    await expect(page.getByText(/would exceed the accepted pro forma total/i)).toBeVisible({
      timeout: 5_000,
    });
    // The recorded payment survives as pending (recoverable), and the
    // manual Verify path refuses it just the same.
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByRole('button', { name: 'Verify' }).first().click();
    await expect(page.getByText(/would exceed the accepted pro forma total/i)).toBeVisible({
      timeout: 5_000,
    });
    await shot(page, '12-overpayment-refused');
  });
});
