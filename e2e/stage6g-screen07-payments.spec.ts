import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6G Screen 07 — Payments page vs
 * designs/APPROVED_DESIGNS/07_Payments_APPROVED.png.
 *
 * Seeds a candidate with one fully paid service (auto-issued invoice +
 * receipt), one partially paid service and one pending payment so the
 * KPI tiles, the Transactions table and the Recent Activity rail all
 * render populated. Screenshots for human comparison; assertions cover
 * structural anchors only.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g');
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

async function recordPayment(
  page: import('@playwright/test').Page,
  leadId: string,
  pfId: string,
  amount: string,
) {
  await page.goto(`/leads/${leadId}/pro-formas/${pfId}`);
  await page.getByRole('button', { name: /Record payment/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel(/Amount/i).fill(amount);
  await dialog.getByRole('button', { name: /Record payment/i }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  // Stage C workflow collapse — an ADMIN's recording verifies in the
  // same action; no separate Verify step exists any more.
  await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Stage C workflow collapse — the admin UI can no longer leave a payment
 * pending, so the pending instalment this screen needs is seeded the way
 * it now arises (a non-finance recording): a PENDING payments row on the
 * pro forma's existing engagement.
 */
async function seedPendingInstalment(pfId: string, amount: string) {
  const m = await dbModules();
  const [existing] = await m.db
    .select({
      engagementId: m.schemas.payments.serviceEngagementId,
      currencyCode: m.schemas.payments.currencyCode,
    })
    .from(m.schemas.payments)
    .where(m.eq(m.schemas.payments.proFormaInvoiceId, pfId))
    .limit(1);
  if (!existing) throw new Error('no prior payment/engagement to attach the pending instalment to');
  await m.db.insert(m.schemas.payments).values({
    serviceEngagementId: existing.engagementId,
    proFormaInvoiceId: pfId,
    amount,
    currencyCode: existing.currencyCode,
    method: 'BANK_TRANSFER',
    status: 'PENDING',
  });
}

test('stage 6G screen 07 — payments page matches the approved layout', async ({ page }) => {
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
      firstName: 'George',
      lastName: `Lugalo-${stamp}`,
      email: `george-07-${stamp}@example.test`,
      phone: '+27821234567',
      nationality: 'South African',
      currentCountry: 'South Africa',
      currentCity: 'Cape Town',
      source: 'DIRECT',
      irishImmigrationStatus: 'NONE',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;

  type SeedPf = { leadId: string; pfId: string };
  const seedPfs: SeedPf[] = [];
  const quoteSeed = [
    { amount: '300.00', name: 'CV & Cover Letter' },
    { amount: '500.00', name: 'Job Search Support' },
  ];
  for (let i = 0; i < quoteSeed.length; i++) {
    const q = quoteSeed[i];
    if (!q) continue;
    const [lead] = await m.db
      .insert(m.schemas.leads)
      .values({
        assignedUserId: await e2eAdminId(),
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
        number: `PF-07-${stamp}-${i}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        sourceLeadId: lead.id,
        payerPersonId: personId,
        currencyCode: 'EUR',
        subtotal: q.amount,
        status: 'ACCEPTED',
        issuedAt: new Date(Date.now() - (6 - i) * 86_400_000),
        acceptedAt: new Date(Date.now() - (5 - i) * 86_400_000),
        acceptedByUserId: admin.id,
        createdByUserId: admin.id,
      })
      .returning({ id: m.schemas.proFormaInvoices.id });
    if (!pf) throw new Error('pf seed failed');
    await m.db.insert(m.schemas.proFormaLineItems).values({
      proFormaInvoiceId: pf.id,
      serviceCatalogItemId: svc.id,
      description: q.name,
      quantity: '1',
      unitPrice: q.amount,
      lineSubtotal: q.amount,
      sortOrder: 0,
    });
    seedPfs.push({ leadId: lead.id, pfId: pf.id });
  }

  try {
    const first = seedPfs[0];
    const second = seedPfs[1];
    // Fully paid → invoice + receipt + candidate activation.
    if (first) await recordPayment(page, first.leadId, first.pfId, '300.00');
    // Partial verified + one pending instalment.
    if (second) {
      await recordPayment(page, second.leadId, second.pfId, '200.00');
      await seedPendingInstalment(second.pfId, '100.00');
    }

    // ── Desktop ───────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/payments');
    await expect(page.getByRole('heading', { level: 1, name: /Payments/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Total Paid')).toBeVisible();
    await expect(page.getByText('Invoices Issued')).toBeVisible();
    await expect(page.getByText('Receipts Issued')).toBeVisible();
    await expect(page.getByText('Overdue')).toBeVisible();
    await expect(page.getByText(/Transactions/).first()).toBeVisible();
    await expect(page.locator('tbody').getByText(`George Lugalo-${stamp}`).first()).toBeVisible();
    await expect(page.locator('tbody').getByText('Paid').first()).toBeVisible();
    await expect(page.locator('tbody').getByText('Pending').first()).toBeVisible();
    // Quick actions link only to existing pages: pro formas and Direct
    // Payment & Convert both start from a lead's row on /leads.
    const quick = page.getByTestId('payments-quick-actions');
    await expect(quick.getByRole('link', { name: 'Open Leads' })).toHaveAttribute('href', '/leads');
    await expect(
      quick.getByText(/Pro formas and Direct Payment & Convert start from a lead/),
    ).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();
    await expect(page.getByText('Payment workflow')).toBeVisible();
    // Let the FadeUp entrance animation finish before capturing.
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen07-desktop-${stamp}.png`) });
    await page.setViewportSize({ width: 1440, height: 2000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen07-desktop-tall-${stamp}.png`) });

    // Cards view toggle.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('link', { name: /Cards/ }).click();
    await expect(page.getByRole('link', { name: /Cards/ })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen07-cards-${stamp}.png`) });

    // ── Mobile ────────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/payments');
    await expect(page.getByRole('heading', { level: 1, name: /Payments/ })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen07-mobile-${stamp}.png`),
      fullPage: true,
    });
  } finally {
    const { eq, schemas, db } = m;
    const engs = await db
      .select({ id: schemas.serviceEngagements.id })
      .from(schemas.serviceEngagements)
      .where(eq(schemas.serviceEngagements.beneficiaryPersonId, personId));
    const engIds = engs.map((e) => e.id);
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
    for (const sp of seedPfs) {
      await db
        .delete(schemas.proFormaLineItems)
        .where(eq(schemas.proFormaLineItems.proFormaInvoiceId, sp.pfId));
      await db.delete(schemas.proFormaInvoices).where(eq(schemas.proFormaInvoices.id, sp.pfId));
    }
    await db.delete(schemas.leads).where(eq(schemas.leads.personId, personId));
    await db
      .delete(schemas.candidateProfiles)
      .where(eq(schemas.candidateProfiles.personId, personId));
    await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
  }
});
