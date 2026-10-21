import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage B — FINAL ACCEPTANCE RUN (release-readiness audit, item 7).
 *
 * One continuous journey across every remediated surface:
 *   lead (Non-EU eligibility) → quote → accept → two partial payments →
 *   verify → automatic activation + official invoice + receipts →
 *   derived "In progress" status → CV upload + scan + certification save →
 *   note with author + exact timestamp → complimentary €0.00 grant →
 *   audited void with engagement reconciliation.
 *
 * DB count checks bracket the money steps so nothing is double-created
 * and the complimentary grant provably adds no payment or receipt.
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-final');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
const FIXTURES = path.resolve('e2e/fixtures');

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const leads = await import('../src/lib/db/schema/leads');
  const services = await import('../src/lib/db/schema/services');
  const commerce = await import('../src/lib/db/schema/commerce');
  const billing = await import('../src/lib/db/schema/billing');
  const proformas = await import('../src/lib/db/schema/proformas');
  const documents = await import('../src/lib/db/schema/documents');
  const cv = await import('../src/lib/db/schema/cv_extractions');
  const details = await import('../src/lib/db/schema/candidate_details');
  const activities = await import('../src/lib/db/schema/activities');
  return {
    db,
    eq,
    and,
    inArray,
    sql,
    schemas: {
      ...persons,
      ...leads,
      ...services,
      ...commerce,
      ...billing,
      ...proformas,
      ...documents,
      ...cv,
      ...details,
      ...activities,
    },
  };
}

type M = Awaited<ReturnType<typeof dbModules>>;

async function counts(m: M, personId: string) {
  const engs = await m.db
    .select({ id: m.schemas.serviceEngagements.id, status: m.schemas.serviceEngagements.status })
    .from(m.schemas.serviceEngagements)
    .where(m.eq(m.schemas.serviceEngagements.beneficiaryPersonId, personId));
  const engIds = engs.map((e) => e.id);
  const invs = engIds.length
    ? await m.db
        .select({ id: m.schemas.invoices.id, status: m.schemas.invoices.status })
        .from(m.schemas.invoices)
        .where(m.inArray(m.schemas.invoices.serviceEngagementId, engIds))
    : [];
  const pays = engIds.length
    ? await m.db
        .select({ id: m.schemas.payments.id })
        .from(m.schemas.payments)
        .where(m.inArray(m.schemas.payments.serviceEngagementId, engIds))
    : [];
  const rcts = invs.length
    ? await m.db
        .select({ id: m.schemas.receipts.id })
        .from(m.schemas.receipts)
        .where(
          m.inArray(
            m.schemas.receipts.invoiceId,
            invs.map((i) => i.id),
          ),
        )
    : [];
  return { engs, invs, payments: pays.length, receipts: rcts.length };
}

test('Stage B final acceptance: complete candidate journey across Waves 1–4', async ({ page }) => {
  test.setTimeout(420_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

  // ── Seed: CS lead whose person carries the new Non-EU eligibility ──
  const [svc] = await m.db
    .select({ id: m.schemas.serviceCatalogItems.id, name: m.schemas.serviceCatalogItems.name })
    .from(m.schemas.serviceCatalogItems)
    .where(
      m.and(
        m.eq(m.schemas.serviceCatalogItems.isActive, true),
        m.eq(m.schemas.serviceCatalogItems.payerType, 'PERSON'),
      ),
    )
    .limit(1);
  if (!svc) test.skip(true, 'no active person-payable service');
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: `Final${stamp}`,
      lastName: 'Acceptance',
      email: `final-${stamp}@example.test`,
      phone: '+353871230000',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
      nationality: 'Indian',
      source: 'DIRECT',
      workEligibility: 'NON_EU_CITIZEN',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;
  const [lead] = await m.db
    .insert(m.schemas.leads)
    .values({ personId, targetBusiness: 'CANDIDATE_SERVICES', status: 'NEW' })
    .returning({ id: m.schemas.leads.id });
  if (!lead) throw new Error('lead seed failed');

  try {
    await page.setViewportSize({ width: 1440, height: 1100 });

    // ── 1. Lead stage: workspace shows the enquiry next-action ──────
    await page.goto(`/clients/${personId}`);
    await expect(page.getByText(new RegExp(`Final${stamp}`, 'i')).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/create the first quote/i)).toBeVisible();

    // ── 2. Quote → issue → accept ────────────────────────────────────
    await page.getByRole('tab', { name: 'Billing' }).click();
    const composer = page.getByRole('dialog');
    await expect(async () => {
      await page
        .getByRole('button', { name: /\+ New quote/i })
        .first()
        .click();
      await expect(composer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await composer.getByRole('button', { name: /save draft/i }).click();
    await expect(composer).not.toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /^Issue$/i })
      .first()
      .click();
    await expect(page.getByText(/quote issued/i).first()).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /^Record client acceptance$/i })
      .first()
      .click();
    const acceptDialog = page.getByRole('dialog');
    await acceptDialog.getByRole('textbox').first().fill('Client confirmed by email');
    await acceptDialog.getByRole('button', { name: /mark as accepted/i }).click();
    await expect(page.getByText(/client accepted/i).first()).toBeVisible({ timeout: 10_000 });

    // ── 3. Two partial payments; the headline balance must equal the
    //       quote total exactly once (Wave 1 double-count fix) ────────
    const [pfRow] = await m.db
      .select({ subtotal: m.schemas.proFormaInvoices.subtotal })
      .from(m.schemas.proFormaInvoices)
      .where(m.eq(m.schemas.proFormaInvoices.sourceLeadId, lead.id))
      .limit(1);
    const total = Number.parseFloat(pfRow?.subtotal ?? '0');
    expect(total).toBeGreaterThan(0);
    const first = (total / 2).toFixed(2);
    const second = (total - Number.parseFloat(first)).toFixed(2);

    await page
      .getByRole('button', { name: /^Record payment$/i })
      .first()
      .click();
    const payDialog = page.getByRole('dialog');
    await payDialog
      .getByLabel(/amount/i)
      .first()
      .fill(first);
    await payDialog.getByRole('button', { name: /^Record payment$/i }).click();
    await expect(payDialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/awaiting finance confirmation/i).first()).toBeVisible({
      timeout: 10_000,
    });
    // Wave 1 regression guard: the owed chip shows the remaining total
    // once — not total + quote-again. The hero shows "€<total> owed"
    // before verification (recorded ≠ verified yet).
    await expect(page.getByText(`€${total.toFixed(2)} owed`).first()).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole('button', { name: /^Verify$/i })
      .first()
      .click();
    await expect(page.getByText(/record payment/i).first()).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole('button', { name: /^Record payment$/i })
      .first()
      .click();
    const payDialog2 = page.getByRole('dialog');
    await payDialog2
      .getByLabel(/amount/i)
      .first()
      .fill(second);
    await payDialog2.getByRole('button', { name: /^Record payment$/i }).click();
    await expect(payDialog2).not.toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /^Verify$/i })
      .first()
      .click();

    // ── 4. Automatic activation + official invoice + receipts ───────
    await expect(page.getByText(/Invoice & receipts/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Settled/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/In progress/i).first()).toBeVisible({ timeout: 10_000 });
    const mid = await counts(m, personId);
    expect(mid.engs).toHaveLength(1);
    expect(mid.invs).toHaveLength(1);
    expect(mid.payments).toBe(2);
    expect(mid.receipts).toBe(2);
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'final-01-activated-1440.png'),
      fullPage: true,
    });

    // ── 5. Wave 1+3: eligibility label carried to the profile, derived
    //       status on the hero ───────────────────────────────────────
    await page.goto(`/clients/${personId}`);
    await expect(page.locator('[title^="Primary onboarding status"]')).toHaveText(/In progress/, {
      timeout: 20_000,
    });
    await expect(page.getByText('Non-EU citizen').first()).toBeVisible();

    // ── 6. Wave 2: CV upload → scan → staged review → save cert ─────
    await page.goto(`/clients/${personId}?tab=documents-candidate`);
    await expect(page.getByText('Upload documents').first()).toBeVisible({ timeout: 20_000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(FIXTURES, 'cv-text.pdf'));
    const uploadBtn = page.getByRole('button', { name: /^Upload \d+ file/ });
    await expect(uploadBtn).toBeEnabled({ timeout: 10_000 });
    await uploadBtn.click();
    await expect(page.getByText(/file uploaded/).first()).toBeVisible({ timeout: 20_000 });
    await page
      .getByRole('button', { name: /Scan CV/i })
      .first()
      .click();
    await expect(page.getByText(/suggestions? ready to review/)).toBeVisible({ timeout: 30_000 });
    const saveBtn = page.getByRole('button', { name: 'Save to profile' });
    await expect(saveBtn).toBeDisabled(); // review-before-save
    await page.getByRole('button', { name: 'Qualifications', exact: true }).click();
    await page.getByRole('button', { name: 'Manual Handling Certificate' }).click();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.getByText('Saved to profile')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'final-02-cv-scan-1440.png'),
      fullPage: false,
    });

    // ── 7. Wave 3: note with author + absolute date & time ───────────
    await page.goto(`/clients/${personId}`);
    await expect(async () => {
      await page.getByRole('button', { name: '+ Add note' }).click();
      await expect(page.getByRole('heading', { name: 'Add note' })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 20_000 });
    await page
      .getByPlaceholder('Internal note about this candidate…')
      .fill(`Final acceptance ${stamp} — docs verified, ready for matching`);
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText(`Final acceptance ${stamp} — docs verified`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .locator('p', { hasText: 'E2E Admin' })
        .filter({ hasText: / at \d{2}:\d{2}/ })
        .first(),
    ).toBeVisible();

    // ── 8. Wave 4: complimentary €0.00 grant — no payment, no receipt ─
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(async () => {
      await page.getByRole('button', { name: 'Grant complimentary service' }).click();
      await expect(page.getByRole('heading', { name: 'Grant complimentary service' })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 20_000 });
    await page.locator('#comp-service').selectOption({ label: svc.name });
    await page
      .locator('#comp-reason')
      .fill(`Final acceptance ${stamp} — follow-up session waived as goodwill`);
    await page.getByRole('button', { name: 'Grant & issue €0.00 invoice' }).click();
    const toast = page.getByText(/Complimentary service granted — invoice INV-/);
    await expect(toast).toBeVisible({ timeout: 15_000 });
    const compNumber = ((await toast.textContent()) ?? '').match(/INV-\d{4}-\d{6}/)?.[0];
    expect(compNumber).toBeTruthy();

    const afterComp = await counts(m, personId);
    expect(afterComp.engs).toHaveLength(2);
    expect(afterComp.invs).toHaveLength(2);
    expect(afterComp.payments).toBe(2); // unchanged — no payment created
    expect(afterComp.receipts).toBe(2); // unchanged — no receipt created
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(page.getByText('Complimentary', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'final-03-complimentary-1440.png'),
      fullPage: true,
    });

    // ── 9. Audited void: invoice VOIDED, engagement reconciled,
    //       candidate + paid service untouched ───────────────────────
    await page.goto(`/candidates/${personId}/invoices/${compNumber}`);
    await expect(async () => {
      await page.getByRole('button', { name: 'Void invoice' }).first().click();
      await expect(
        page.getByPlaceholder('e.g. Duplicate issued in error, wrong currency'),
      ).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page
      .getByPlaceholder('e.g. Duplicate issued in error, wrong currency')
      .fill('Final acceptance — goodwill withdrawn before delivery');
    await page.getByRole('button', { name: 'Void invoice' }).last().click();
    await expect(page.getByText('Voided', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const end = await counts(m, personId);
    expect(end.engs.map((e) => e.status).sort()).toEqual(['ACTIVE', 'CANCELLED']);
    expect(end.invs.map((i) => i.status).sort()).toEqual(['PAID', 'VOIDED']);
    expect(end.payments).toBe(2);
    expect(end.receipts).toBe(2);
    const [profile] = await m.db
      .select({
        lifecycleStatus: m.schemas.candidateProfiles.lifecycleStatus,
        workEligibility: m.schemas.candidateProfiles.workEligibility,
      })
      .from(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    expect(profile?.lifecycleStatus).toBe('ACTIVE');
    expect(profile?.workEligibility).toBe('NON_EU_CITIZEN');
    // Audit trail intact: grant + void + engagement cancellation.
    const audit = await m.db.execute<{ action: string }>(m.sql`
      SELECT action FROM audit_events
      WHERE (context ->> 'personId') = ${personId}
         OR entity_id IN (${m.sql.join(
           end.invs.map((i) => m.sql`${i.id}`),
           m.sql`, `,
         )})
    `);
    const actions = (audit as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toContain('COMPLIMENTARY_GRANTED');
    expect(actions).toContain('VOIDED');

    // Hero still shows the truthful derived status for the live paid
    // engagement.
    await page.goto(`/clients/${personId}`);
    await expect(page.locator('[title^="Primary onboarding status"]')).toHaveText(/In progress/, {
      timeout: 20_000,
    });

    // ── 10. Final responsive captures for the report ─────────────────
    for (const [w, h, label] of [
      [1440, 1100, '1440'],
      [820, 1180, '820'],
      [390, 844, '390'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/clients/${personId}`);
      await expect(page.getByText(new RegExp(`Final${stamp}`, 'i')).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `final-workspace-${label}.png`),
        fullPage: w === 1440,
      });
    }
  } finally {
    // Cleanup in dependency order.
    const { eq, inArray, schemas, db } = m;
    await db
      .delete(schemas.communicationLogs)
      .where(eq(schemas.communicationLogs.personId, personId));
    const docs = await db
      .select({ id: schemas.documentInstances.id })
      .from(schemas.documentInstances)
      .where(eq(schemas.documentInstances.ownerPersonId, personId));
    const docIds = docs.map((d) => d.id);
    if (docIds.length > 0) {
      await db
        .delete(schemas.cvExtractions)
        .where(inArray(schemas.cvExtractions.documentInstanceId, docIds));
      await db
        .delete(schemas.documentRequirementFulfillments)
        .where(inArray(schemas.documentRequirementFulfillments.documentInstanceId, docIds));
      await db
        .delete(schemas.documentInstances)
        .where(inArray(schemas.documentInstances.id, docIds));
    }
    await db
      .delete(schemas.candidateQualifications)
      .where(eq(schemas.candidateQualifications.personId, personId));
    const engs = await db
      .select({ id: schemas.serviceEngagements.id })
      .from(schemas.serviceEngagements)
      .where(eq(schemas.serviceEngagements.beneficiaryPersonId, personId));
    const engIds = engs.map((e) => e.id);
    if (engIds.length > 0) {
      const invs = await db
        .select({ id: schemas.invoices.id })
        .from(schemas.invoices)
        .where(inArray(schemas.invoices.serviceEngagementId, engIds));
      const invIds = invs.map((i) => i.id);
      const pays = await db
        .select({ id: schemas.payments.id })
        .from(schemas.payments)
        .where(inArray(schemas.payments.serviceEngagementId, engIds));
      const payIds = pays.map((p) => p.id);
      if (payIds.length > 0)
        await db.delete(schemas.receipts).where(inArray(schemas.receipts.paymentId, payIds));
      if (invIds.length > 0) {
        await db
          .delete(schemas.proFormaOfficialInvoices)
          .where(inArray(schemas.proFormaOfficialInvoices.invoiceId, invIds));
        await db
          .delete(schemas.invoiceLineItems)
          .where(inArray(schemas.invoiceLineItems.invoiceId, invIds));
        await db.delete(schemas.invoices).where(inArray(schemas.invoices.id, invIds));
      }
      await db
        .delete(schemas.payments)
        .where(inArray(schemas.payments.serviceEngagementId, engIds));
      await db
        .delete(schemas.serviceEngagements)
        .where(inArray(schemas.serviceEngagements.id, engIds));
    }
    const pfs = await db
      .select({ id: schemas.proFormaInvoices.id })
      .from(schemas.proFormaInvoices)
      .where(eq(schemas.proFormaInvoices.sourceLeadId, lead.id));
    if (pfs.length > 0) {
      const pfIds = pfs.map((x) => x.id);
      await db
        .delete(schemas.proFormaLineItems)
        .where(inArray(schemas.proFormaLineItems.proFormaInvoiceId, pfIds));
      await db.delete(schemas.proFormaInvoices).where(inArray(schemas.proFormaInvoices.id, pfIds));
      await db.delete(schemas.proposalGroups).where(eq(schemas.proposalGroups.leadId, lead.id));
    }
    await db
      .delete(schemas.candidateProfiles)
      .where(eq(schemas.candidateProfiles.personId, personId));
    await db.delete(schemas.leads).where(eq(schemas.leads.id, lead.id));
    await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
  }
});
