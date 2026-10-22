import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage B Wave 1 — client-remediation regressions.
 *
 * 1. P0 balance double-count: a part-paid ACCEPTED quote must be
 *    counted ONCE in the workspace hero "owed" chip (was doubled).
 *    Captures 1440 / 820 / 390 screenshots for the visual evidence
 *    pack.
 * 2. Invoice generation: raising a second invoice for the same payer +
 *    service surfaces the inline duplicate warning and requires an
 *    audited override reason before proceeding.
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-wave1');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const leads = await import('../src/lib/db/schema/leads');
  const commerce = await import('../src/lib/db/schema/commerce');
  const billing = await import('../src/lib/db/schema/billing');
  const proformas = await import('../src/lib/db/schema/proformas');
  const servicesSchema = await import('../src/lib/db/schema/services');
  const users = await import('../src/lib/db/schema/users');
  return {
    db,
    eq,
    and,
    inArray,
    schemas: {
      ...persons,
      ...leads,
      ...commerce,
      ...billing,
      ...proformas,
      ...servicesSchema,
      ...users,
    },
  };
}

async function cleanupPerson(m: Awaited<ReturnType<typeof dbModules>>, personId: string) {
  const { eq, schemas, db } = m;
  const engs = await db
    .select({ id: schemas.serviceEngagements.id })
    .from(schemas.serviceEngagements)
    .where(eq(schemas.serviceEngagements.beneficiaryPersonId, personId));
  const payerEngs = await db
    .select({ id: schemas.serviceEngagements.id })
    .from(schemas.serviceEngagements)
    .where(eq(schemas.serviceEngagements.payerPersonId, personId));
  const engIds = [...new Set([...engs, ...payerEngs].map((e) => e.id))];
  if (engIds.length > 0) {
    const invs = await db
      .select({ id: schemas.invoices.id })
      .from(schemas.invoices)
      .where(m.inArray(schemas.invoices.serviceEngagementId, engIds));
    const invIds = invs.map((i) => i.id);
    const pays = await db
      .select({ id: schemas.payments.id })
      .from(schemas.payments)
      .where(m.inArray(schemas.payments.serviceEngagementId, engIds));
    const payIds = pays.map((p) => p.id);
    if (payIds.length > 0)
      await db.delete(schemas.receipts).where(m.inArray(schemas.receipts.paymentId, payIds));
    if (invIds.length > 0) {
      await db
        .delete(schemas.invoiceLineItems)
        .where(m.inArray(schemas.invoiceLineItems.invoiceId, invIds));
      await db
        .delete(schemas.proFormaOfficialInvoices)
        .where(m.inArray(schemas.proFormaOfficialInvoices.invoiceId, invIds));
      await db.delete(schemas.invoices).where(m.inArray(schemas.invoices.id, invIds));
    }
    await db
      .delete(schemas.payments)
      .where(m.inArray(schemas.payments.serviceEngagementId, engIds));
    await db
      .delete(schemas.serviceEngagements)
      .where(m.inArray(schemas.serviceEngagements.id, engIds));
  }
  const pfs = await db
    .select({ id: schemas.proFormaInvoices.id })
    .from(schemas.proFormaInvoices)
    .where(eq(schemas.proFormaInvoices.payerPersonId, personId));
  const pfIds = pfs.map((p) => p.id);
  if (pfIds.length > 0) {
    await db
      .delete(schemas.proFormaLineItems)
      .where(m.inArray(schemas.proFormaLineItems.proFormaInvoiceId, pfIds));
    await db.delete(schemas.proFormaInvoices).where(m.inArray(schemas.proFormaInvoices.id, pfIds));
  }
  const leadRows = await db
    .select({ id: schemas.leads.id })
    .from(schemas.leads)
    .where(eq(schemas.leads.personId, personId));
  const leadIds = leadRows.map((l) => l.id);
  if (leadIds.length > 0)
    await db
      .delete(schemas.proposalGroups)
      .where(m.inArray(schemas.proposalGroups.leadId, leadIds));
  await db.delete(schemas.leads).where(eq(schemas.leads.personId, personId));
  await db
    .delete(schemas.candidateProfiles)
    .where(eq(schemas.candidateProfiles.personId, personId));
  await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
}

test('P0 regression: part-paid accepted quote is counted once in the workspace balance', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

  const [admin] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin user missing');
  const [svc] = await m.db
    .select({ id: m.schemas.serviceCatalogItems.id })
    .from(m.schemas.serviceCatalogItems)
    .where(
      m.and(
        m.eq(m.schemas.serviceCatalogItems.isActive, true),
        m.eq(m.schemas.serviceCatalogItems.payerType, 'PERSON'),
      ),
    )
    .limit(1);
  if (!svc) throw new Error('no active service in test DB');

  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Wave',
      lastName: `One-${stamp}`,
      email: `wave1-${stamp}@example.test`,
      nationality: 'South African',
      currentCountry: 'South Africa',
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;
  const [lead] = await m.db
    .insert(m.schemas.leads)
    .values({
      personId,
      targetBusiness: 'CANDIDATE_SERVICES',
      serviceOfInterestId: svc.id,
      status: 'AWAITING_PAYMENT',
    })
    .returning({ id: m.schemas.leads.id });
  if (!lead) throw new Error('lead seed failed');
  const [pf] = await m.db
    .insert(m.schemas.proFormaInvoices)
    .values({
      number: `PF-W1-${stamp}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      sourceLeadId: lead.id,
      payerPersonId: personId,
      currencyCode: 'EUR',
      subtotal: '500.00',
      status: 'ACCEPTED',
      issuedAt: new Date(Date.now() - 3 * 86_400_000),
      acceptedAt: new Date(Date.now() - 2 * 86_400_000),
      acceptedByUserId: admin.id,
      createdByUserId: admin.id,
    })
    .returning({ id: m.schemas.proFormaInvoices.id });
  if (!pf) throw new Error('pf seed failed');
  await m.db.insert(m.schemas.proFormaLineItems).values({
    proFormaInvoiceId: pf.id,
    serviceCatalogItemId: svc.id,
    description: 'Job Search Support',
    quantity: '1',
    unitPrice: '500.00',
    lineSubtotal: '500.00',
    sortOrder: 0,
  });

  try {
    // Record + verify a €200 partial payment through the real UI.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/leads/${lead.id}/pro-formas/${pf.id}`);
    const dialog = page.getByRole('dialog');
    await expect(async () => {
      await page.getByRole('button', { name: /Record payment/i }).click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await dialog.getByLabel(/Amount/i).fill('200.00');
    await dialog.getByRole('button', { name: /Record payment/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    // Stage C workflow collapse — an ADMIN's recording verifies in the
    // same action; the manual Verify button no longer exists.
    await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
    expect(await page.getByRole('button', { name: /^Verify$/ }).count()).toBe(0);

    // The workspace hero must show €300 owed — not the doubled €800.
    await page.goto(`/clients/${personId}`);
    await expect(page.getByRole('heading', { name: new RegExp(`One-${stamp}`) })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('€300.00 owed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('€800.00 owed')).toHaveCount(0);
    // And the quote is not shown as a second "pending" commitment card.
    await expect(page.getByText('Pending quote')).toHaveCount(0);

    // Visual evidence at the three approved widths.
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS_DIR, `balance-1440-${stamp}.png`) });
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS_DIR, `balance-820-${stamp}.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS_DIR, `balance-390-${stamp}.png`) });
  } finally {
    await cleanupPerson(m, personId);
  }
});

test('invoice generation warns on same payer + service and requires an audited override', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

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
  if (!svc) throw new Error('no active service in test DB');
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Dup',
      lastName: `Guard-${stamp}`,
      email: `dupguard-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;
  // Non-CS lead — the "Add another invoice…" generate path is gated off
  // Candidate Services rows (CS is quote-first).
  const [lead] = await m.db
    .insert(m.schemas.leads)
    .values({
      personId,
      targetBusiness: 'IMMIGRATION',
      serviceOfInterestId: svc.id,
      status: 'NEW',
    })
    .returning({ id: m.schemas.leads.id });
  if (!lead) throw new Error('lead seed failed');

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/leads?assigned=all');
    const row = page.locator('tr', { hasText: new RegExp(`Guard-${stamp}`, 'i') }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const raiseOnce = async () => {
      await expect(async () => {
        await row.getByRole('button', { name: /More actions/i }).click();
        await expect(page.getByRole('menuitem', { name: /invoice/i }).first()).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 20_000 });
      await page
        .getByRole('menuitem', { name: /invoice/i })
        .first()
        .click();
      const dlg = page.getByRole('dialog');
      await expect(dlg).toBeVisible({ timeout: 10_000 });
      return dlg;
    };

    // First invoice — fill a price and generate.
    let dlg = await raiseOnce();
    await dlg.getByLabel(/Unit price/i).fill('120.00');
    await dlg.getByRole('button', { name: /Generate invoice/i }).click();
    await expect(page.getByText(/Invoice INV-\S+ issued/).first()).toBeVisible({
      timeout: 15_000,
    });

    // Second invoice for the SAME payer + service (different amount!) —
    // inline duplicate warning, then audited override.
    await page.goto('/leads?assigned=all');
    await expect(row).toBeVisible({ timeout: 15_000 });
    dlg = await raiseOnce();
    await dlg.getByLabel(/Unit price/i).fill('80.00');
    await dlg.getByRole('button', { name: /Generate invoice/i }).click();
    await expect(dlg.getByText(/already exists on this payer/i)).toBeVisible({ timeout: 15_000 });
    // The dialog stays open; Generate is blocked until a reason is given.
    await expect(
      dlg.getByLabel(/Reason for proceeding despite a possible duplicate/i),
    ).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS_DIR, `dup-warning-${stamp}.png`) });
    await dlg
      .getByLabel(/Reason for proceeding despite a possible duplicate/i)
      .fill('Client bought the same service twice — confirmed by phone.');
    await dlg.getByRole('button', { name: /Generate invoice/i }).click();
    await expect(page.getByText(/Invoice INV-\S+ issued/).first()).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await cleanupPerson(m, personId);
  }
});
