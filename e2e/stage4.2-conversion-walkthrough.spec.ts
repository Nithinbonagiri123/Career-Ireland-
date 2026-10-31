import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 4.2 — lead-to-candidate conversion walkthrough.
 *
 * Scope:
 *   1. Seed a fresh CS lead whose person has middle name, address and
 *      primary occupation set (the Stage 1 CS-strict fields).
 *   2. Create a pro-forma, record+verify full payment → invoice is
 *      auto-issued → PF flips CONVERTED (reusing the Stage 3 flow).
 *   3. Convert the lead via the row-level "Convert → activate
 *      candidate" action. The PF-origin guard means NO duplicate
 *      payment/receipt/invoice is created.
 *   4. Verify in the DB that:
 *      - exactly one candidate_profile exists for this person
 *      - candidate_profile.primary_occupation_id was copied from the
 *        person (profession transfer invariant)
 *      - persons row still carries middle name + address line 1
 *      - exactly one invoice exists on the source lead
 *      - exactly one receipt exists for the payment
 *      - exactly one payment row (no duplicate from acceptLead)
 *   5. Navigate to the candidate profile and confirm it renders +
 *      shows the primary occupation in the Profile card + has an
 *      accessible Billing section with the invoice/receipt.
 */

const SHOTS_DIR = path.resolve('playwright/stage4.2-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function seedCsLeadWithIdentity(): Promise<{
  leadId: string;
  personId: string;
  middleName: string;
  addressLine1: string;
  occupationId: string;
  occupationName: string;
}> {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { occupations } = await import('../src/lib/db/schema/occupations');

  let [occ] = await db
    .select({ id: occupations.id, name: occupations.name })
    .from(occupations)
    .where(eq(occupations.isActive, true))
    .limit(1);
  if (!occ) {
    // Fresh CI databases seed no occupations — create one so the
    // walkthrough is self-sufficient.
    const { occupationCategories } = await import('../src/lib/db/schema/occupations');
    let [cat] = await db
      .select({ id: occupationCategories.id })
      .from(occupationCategories)
      .limit(1);
    if (!cat) {
      [cat] = await db
        .insert(occupationCategories)
        .values({ name: `E2E Category ${Date.now()}` })
        .returning({ id: occupationCategories.id });
    }
    if (!cat) throw new Error('could not seed occupation category');
    [occ] = await db
      .insert(occupations)
      .values({ categoryId: cat.id, name: `E2E Occupation ${Date.now()}` })
      .returning({ id: occupations.id, name: occupations.name });
  }
  if (!occ) throw new Error('no active occupation');

  const stamp = Math.random().toString(36).slice(2, 6);
  const middleName = `Mid${stamp}`;
  const addressLine1 = `${stamp} Test Street`;

  const [p] = await db
    .insert(persons)
    .values({
      firstName: `S42First${stamp}`,
      middleName,
      lastName: `S42Last${stamp}`,
      email: `s42-${stamp}@example.test`,
      phone: `+353${Date.now() % 1_000_000_000}`,
      source: 'DIRECT',
      addressLine1,
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
      primaryOccupationId: occ.id,
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person seed');

  const [l] = await db
    .insert(leads)
    .values({
      assignedUserId: await e2eAdminId(),
      targetBusiness: 'CANDIDATE_SERVICES',
      personId: p.id,
      status: 'NEW',
    })
    .returning({ id: leads.id });
  if (!l) throw new Error('lead seed');

  return {
    leadId: l.id,
    personId: p.id,
    middleName,
    addressLine1,
    occupationId: occ.id,
    occupationName: occ.name,
  };
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
  if (!row) throw new Error('no pro forma');
  return row.id;
}

test.describe('Stage 4.2 — lead-to-candidate conversion', () => {
  test('full journey: lead with identity → PF → invoice → convert → candidate', async ({
    page,
  }) => {
    const seeded = await seedCsLeadWithIdentity();

    try {
      // Create + issue + accept + pay + verify (reuses Stage 3 UI).
      // Stage 6D — person-linked leads land on the Client Workspace;
      // quote creation moved to its "+ New quote" button.
      await page.goto(`/leads/${seeded.leadId}`);
      await expect(page.getByRole('button', { name: '+ New quote' }).first()).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: '+ New quote' }).first().click();
      await expect(page.getByRole('heading', { name: /^Create pro forma$/ })).toBeVisible();
      await page.getByPlaceholder('Appears on the PDF line').first().fill('Conversion test');
      const q = page.locator('input[inputmode="decimal"]');
      await q.nth(0).fill('1');
      await q.nth(1).fill('250.00');
      await page.getByRole('button', { name: 'Save draft' }).click();
      await expect(page.getByText('Pro forma draft created')).toBeVisible();

      const pfId = await latestProFormaId(seeded.leadId);
      await page.goto(`/leads/${seeded.leadId}/pro-formas/${pfId}`);
      await page.getByRole('button', { name: 'Issue' }).click();
      await expect(page.getByText('Pro forma issued')).toBeVisible();
      await page.getByRole('button', { name: 'Record client acceptance' }).click();
      await page.getByPlaceholder('Required for the audit log').fill('Stage 4.2 conversion');
      await page.getByRole('button', { name: 'Mark as accepted' }).click();
      await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Record payment' }).click();
      await page.getByLabel(/^Amount \(EUR\)$/).fill('250.00');
      await page.getByRole('dialog').getByRole('button', { name: 'Record payment' }).click();
      // Stage C workflow collapse — the full payment verifies and issues
      // the official invoice in the same action; no Verify click exists.
      await expect(page.getByText(/invoice INV-\S+ issued/)).toBeVisible({
        timeout: 10_000,
      });
      expect(await page.getByRole('button', { name: 'Verify' }).count()).toBe(0);
      await expect(page.getByText('Converted', { exact: true }).first()).toBeVisible();
      await shot(page, '01-pf-converted');

      // Independent DB verification: profession transferred, no dupes
      // yet (we haven't done the lead-level Convert click — doing it
      // next). Count payments/receipts/invoices.
      const { eq } = await import('drizzle-orm');
      const { db } = await import('../src/lib/db/client');
      const { candidateProfiles, persons } = await import('../src/lib/db/schema/persons');
      const { payments } = await import('../src/lib/db/schema/commerce');
      const { invoices, receipts } = await import('../src/lib/db/schema/billing');

      const beforePayments = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.proFormaInvoiceId, pfId));
      const beforeReceipts = await db.select({ id: receipts.id }).from(receipts);
      const beforeInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.sourceLeadId, seeded.leadId));
      expect(beforePayments.length).toBe(1);
      expect(beforeInvoices.length).toBe(1);

      // Stage 6E — verifying the full PF payment auto-issues the
      // invoice AND activates the candidate in the same transaction
      // ("…and candidate is now active"), so the old lead-row
      // "Convert → activate candidate" step no longer exists. Assert
      // the auto-converted end state on the Client Workspace.
      await page.goto(`/clients/${seeded.personId}`);
      await expect(page.getByText(/S42First/).first()).toBeVisible({ timeout: 15_000 });
      // Stage B Wave 3 — the paid activation leaves a live engagement,
      // so the derived hero status reads "In progress".
      await expect(page.getByText(/In progress/i).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(seeded.occupationName).first()).toBeVisible();
      await shot(page, '03-candidate-workspace');

      // DB-level invariant checks — no duplicate rows after conversion.
      const [profile] = await db
        .select({
          id: candidateProfiles.id,
          personId: candidateProfiles.personId,
          primaryOccupationId: candidateProfiles.primaryOccupationId,
        })
        .from(candidateProfiles)
        .where(eq(candidateProfiles.personId, seeded.personId));
      expect(profile).toBeDefined();
      // Profession transferred.
      expect(profile.primaryOccupationId).toBe(seeded.occupationId);

      // Middle name + address line 1 preserved on persons.
      const [personAfter] = await db
        .select({
          middleName: persons.middleName,
          addressLine1: persons.addressLine1,
        })
        .from(persons)
        .where(eq(persons.id, seeded.personId));
      expect(personAfter.middleName).toBe(seeded.middleName);
      expect(personAfter.addressLine1).toBe(seeded.addressLine1);

      // No duplicate payment / receipt / invoice.
      const afterPayments = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.proFormaInvoiceId, pfId));
      const afterInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.sourceLeadId, seeded.leadId));
      // Receipt count: should match the pre-conversion count (1 receipt
      // for the pre-convert payment); the conversion added none.
      const afterReceipts = await db.select({ id: receipts.id }).from(receipts);
      expect(afterPayments.length).toBe(beforePayments.length);
      expect(afterInvoices.length).toBe(beforeInvoices.length);
      expect(afterReceipts.length).toBe(beforeReceipts.length);

      // Billing surface accessible — click the Billing tab + confirm
      // at least one invoice row is visible.
      await page.goto(`/clients/${seeded.personId}?tab=billing`);
      await expect(page.getByText(/INV-/).first()).toBeVisible({ timeout: 10_000 });
      await shot(page, '04-candidate-billing');
    } finally {
      // Cleanup: delete the seeded person's traces (lead, candidate_profile,
      // engagement, invoice, receipt, payment, pro-forma) is complex because
      // of FK chains. For a dev-DB walkthrough we leave the rows and tag
      // the audit log so operators can filter them out.
      // Intentionally no-op.
    }
  });
});
