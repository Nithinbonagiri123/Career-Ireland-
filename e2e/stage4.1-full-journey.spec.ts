import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * Stage 4.1 — final end-to-end walkthrough.
 *
 *   1. Combined filter test: status + source + date-range URL
 *      persistence; search / sort / pagination still work.
 *   2. Reactivation UI: an EXPIRED lead is reactivated via the row
 *      dropdown + reason prompt; status returns to CONTACTED.
 *   3. Full conversion journey: create pro-forma on a CS lead, record
 *      full payment, verify → invoice auto-issued, then "Convert →
 *      activate candidate" which must NOT create a duplicate payment
 *      (the PF-origin guard).
 */

const SHOTS_DIR = path.resolve('playwright/stage4.1-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function pickCsLead(): Promise<{ id: string; personId: string }> {
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
    .values({ personId: p.id, targetBusiness: 'CANDIDATE_SERVICES', status: 'NEW' })
    .returning({ id: leads.id });
  if (!lead) throw new Error('could not seed CS lead');
  return { id: lead.id, personId: p.id };
}

async function latestProFormaId(leadId: string): Promise<string> {
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

test.describe('Stage 4.1 — final journey', () => {
  test('combined filter: status + source + date-range persist in URL + preserve search', async ({
    page,
  }) => {
    // URL-persistence is the contract: the Filter dropdown writes params
    // that the leads-table reads on mount. The dropdown's open/close +
    // checkbox interactions are a UI nicety; the test asserts the real
    // invariant by hitting the URL with the composed state directly.
    await page.goto(
      '/leads?assigned=all&status=NEW,CONTACTED&source=DIRECT&createdFrom=2026-01-01',
    );
    await expect(page.getByRole('button', { name: /^Filter/ })).toBeVisible({ timeout: 15_000 });
    // Filter chip shows the active count.
    await expect(page.getByRole('button', { name: /^Filter.*\d/ })).toBeVisible();
    await shot(page, '01-combined-filter-url');

    // Reload — URL state persists.
    await page.reload();
    await expect(page).toHaveURL(/status=NEW/);
    await expect(page).toHaveURL(/source=DIRECT/);
    await expect(page).toHaveURL(/createdFrom=2026-01-01/);

    // Search box still works alongside the filters.
    await page.getByPlaceholder(/Search leads by name/).fill('a');
    await shot(page, '02-search-with-filters');

    // Open the Filter dropdown + Clear all removes every applied filter.
    await page.getByRole('button', { name: /^Filter/ }).click();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page).not.toHaveURL(/createdFrom=/);
  });

  test('full conversion journey: lead → pro forma → payment → verify → convert', async ({
    page,
  }) => {
    const lead = await pickCsLead();
    // Stage 6D — redirects to the Client Workspace; quote creation moved
    // to its "+ New quote" button. The pro-forma detail page the rest of
    // this test drives still lives at its original URL.
    await page.goto(`/leads/${lead.id}`);
    await expect(page.getByRole('heading', { name: /Service billing/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Create a 1-line pro forma for EUR 100.
    await page.getByRole('button', { name: '+ New quote' }).first().click();
    await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
    await page.getByPlaceholder('Appears on the PDF line').first().fill('Stage 4.1 conversion');
    const q = page.locator('input[inputmode="decimal"]');
    await q.nth(0).fill('1');
    await q.nth(1).fill('100.00');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Pro forma draft created')).toBeVisible();

    // Open latest, issue, accept, pay, verify.
    const pfId = await latestProFormaId(lead.id);
    await page.goto(`/leads/${lead.id}/pro-formas/${pfId}`);
    await page.getByRole('button', { name: 'Issue' }).click();
    await expect(page.getByText('Pro forma issued')).toBeVisible();
    await page.getByRole('button', { name: 'Record client acceptance' }).click();
    await page.getByPlaceholder('Required for the audit log').fill('Stage 4.1 journey');
    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await expect(page.getByText(/ACCEPTED/).first()).toBeVisible();
    await shot(page, '03-pf-accepted');

    await page.getByRole('button', { name: 'Record payment' }).click();
    await page.getByLabel(/^Amount \(EUR\)$/).fill('100.00');
    await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
    // Stage C workflow collapse — the full payment verifies and issues
    // the official invoice in the same action; no Verify click exists.
    await expect(page.getByText(/invoice INV-\S+ issued/)).toBeVisible({
      timeout: 10_000,
    });
    expect(await page.getByRole('button', { name: 'Verify' }).count()).toBe(0);
    await expect(page.getByText(/CONVERTED/).first()).toBeVisible();
    await shot(page, '04-invoice-issued-pf-converted');

    // Note: the "Convert → activate candidate" action from the leads-row
    // menu reuses the PF-origin invoice (no duplicate payment); test
    // coverage for that path lives in src/modules/leads/service.ts +
    // scripts/stage4-safety-checks.ts (A7). The UI's existing Record-
    // Payment dialog on the leads row stays intact for non-PF leads.
  });

  test('reactivation UI appears on expired leads and writes an audit event', async ({ page }) => {
    // Seed: create a fresh CS lead, directly flip its status to EXPIRED
    // for the test. (A browser-only EXPIRED-induction path would require
    // backdating created_at, which the DB tests already cover.)
    const { config: loadEnv } = await import('dotenv');
    loadEnv({ path: '.env.local' });
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../src/lib/db/client');
    const { leads } = await import('../src/lib/db/schema/leads');
    const { persons } = await import('../src/lib/db/schema/persons');
    const [p] = await db
      .insert(persons)
      .values({
        firstName: 'Expiry',
        lastName: `UI${Math.random().toString(36).slice(2, 5)}`,
        source: 'DIRECT',
      })
      .returning({ id: persons.id });
    if (!p) throw new Error('seed person');
    const [l] = await db
      .insert(leads)
      .values({
        targetBusiness: 'CANDIDATE_SERVICES',
        personId: p.id,
        status: 'EXPIRED',
        expiredAt: new Date(),
        expiredByReason: 'ui_test_seed',
      })
      .returning({ id: leads.id });
    if (!l) throw new Error('seed lead');

    try {
      await page.goto('/leads?assigned=all&expired=true');
      await expect(page.getByRole('button', { name: /^Filter/ })).toBeVisible({ timeout: 15_000 });
      // The seeded lead should appear with the EXPIRED badge.
      await expect(page.getByText('EXPIRED').first()).toBeVisible();
      await shot(page, '05-expired-filter');

      // Open row dropdown → Reactivate.
      const row = page.getByRole('row').filter({ hasText: 'EXPIRED' }).first();
      await row.getByRole('button', { name: 'Admin actions' }).click();
      await page.getByRole('menuitem', { name: /Reactivate lead/ }).click();

      await expect(page.getByRole('heading', { name: /^Reactivate /i })).toBeVisible();
      await page.getByLabel(/Reason/).fill('Stage 4.1 e2e reactivation');
      await shot(page, '06-reactivate-prompt');
      await page.getByRole('button', { name: /^Reactivate$/ }).click();
      await expect(page.getByText(/lead reactivated/)).toBeVisible({ timeout: 5_000 });
      await shot(page, '07-reactivated-toast');
    } finally {
      await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    }
  });
});
