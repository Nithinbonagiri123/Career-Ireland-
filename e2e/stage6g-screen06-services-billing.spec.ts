import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 06 — Services & Billing tab vs
 * designs/APPROVED_DESIGNS/06_Services_APPROVED.png.
 *
 * Seeds a realistic candidate plus a small catalogue of described,
 * priced services so every mockup surface renders populated: header
 * card, Available-services picker grid, Active-services column,
 * create-new-service card and the Service history table. Captures
 * desktop + mobile screenshots for human comparison; assertions cover
 * the structural anchors only (no pixel diffing).
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

async function payAndVerify(
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
  // same action; the manual Verify button no longer exists.
  await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
  expect(await page.getByRole('button', { name: /^Verify$/ }).count()).toBe(0);
}

test('stage 6G screen 06 — services & billing tab matches the approved layout', async ({
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

  // ── Catalogue: a category + six described, priced services so the
  //    Available-services grid renders like the mockup. ─────────────
  const [category] = await m.db
    .insert(m.schemas.serviceCategories)
    .values({
      slug: `cs-visual-${stamp}`,
      name: 'Candidate Services',
      displayOrder: 1,
    })
    .returning({ id: m.schemas.serviceCategories.id });
  if (!category) throw new Error('category seed failed');
  const catalogueSeed = [
    ['CV & Cover Letter', 'Professional CV writing and cover letter preparation', '150.00'],
    ['Job Search Support', 'Full job search campaign with employer outreach', '500.00'],
    [
      'Interview Preparation',
      'Mock interviews and feedback with Irish employers in mind',
      '100.00',
    ],
    ['Career Consultation', 'One-to-one session to map the route to an Irish role', '75.00'],
    [
      'Profile Marketing',
      'Active promotion of the candidate profile to partner employers',
      '250.00',
    ],
    ['LinkedIn Optimization', 'Profile rewrite, keywords and recruiter visibility boost', '90.00'],
  ] as const;
  const catalogueIds: string[] = [];
  for (let i = 0; i < catalogueSeed.length; i++) {
    const [name, description, price] = catalogueSeed[i] as (typeof catalogueSeed)[number];
    const [item] = await m.db
      .insert(m.schemas.serviceCatalogItems)
      .values({
        code: `VIS06_${stamp}_${i}`,
        name,
        description,
        defaultCurrencyCode: 'EUR',
        defaultPrice: price,
        payerType: 'PERSON',
        categoryId: category.id,
        isActive: true,
      })
      .returning({ id: m.schemas.serviceCatalogItems.id });
    if (!item) throw new Error('catalog seed failed');
    catalogueIds.push(item.id);
  }

  // ── Candidate ────────────────────────────────────────────────────
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Lerato',
      lastName: `Mokoena-${stamp}`,
      email: `lerato-06-${stamp}@example.test`,
      phone: '+27824567890',
      dateOfBirth: '1988-03-14',
      nationality: 'South African',
      currentCountry: 'South Africa',
      currentCity: 'Cape Town',
      source: 'DIRECT',
      irishImmigrationStatus: 'NONE',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;

  // Two accepted quotes on their own CS leads (fully paid + partial),
  // plus one merely-issued quote so the history table shows an
  // "In progress" row.
  type SeedPf = { leadId: string; pfId: string; amount: string; name: string };
  const seedPfs: SeedPf[] = [];
  const quoteSeed = [
    { amount: '150.00', name: 'CV & Cover Letter', itemIdx: 0, status: 'ACCEPTED' as const },
    { amount: '500.00', name: 'Job Search Support', itemIdx: 1, status: 'ACCEPTED' as const },
    { amount: '100.00', name: 'Interview Preparation', itemIdx: 2, status: 'ISSUED' as const },
  ];
  for (let i = 0; i < quoteSeed.length; i++) {
    const q = quoteSeed[i];
    if (!q) continue;
    const [lead] = await m.db
      .insert(m.schemas.leads)
      .values({
        personId,
        targetBusiness: 'CANDIDATE_SERVICES',
        serviceOfInterestId: catalogueIds[q.itemIdx] as string,
        status: 'AWAITING_PAYMENT',
      })
      .returning({ id: m.schemas.leads.id });
    if (!lead) throw new Error('lead seed failed');
    const [pf] = await m.db
      .insert(m.schemas.proFormaInvoices)
      .values({
        number: `PF-06-${stamp}-${i}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
        sourceLeadId: lead.id,
        payerPersonId: personId,
        currencyCode: 'EUR',
        subtotal: q.amount,
        status: q.status,
        issuedAt: new Date(Date.now() - (10 - i * 2) * 86_400_000),
        ...(q.status === 'ACCEPTED'
          ? {
              acceptedAt: new Date(Date.now() - (8 - i * 2) * 86_400_000),
              acceptedByUserId: admin.id,
            }
          : {}),
        createdByUserId: admin.id,
      })
      .returning({ id: m.schemas.proFormaInvoices.id });
    if (!pf) throw new Error('pf seed failed');
    await m.db.insert(m.schemas.proFormaLineItems).values({
      proFormaInvoiceId: pf.id,
      serviceCatalogItemId: catalogueIds[q.itemIdx] as string,
      description: q.name,
      quantity: '1',
      unitPrice: q.amount,
      lineSubtotal: q.amount,
      sortOrder: 0,
    });
    seedPfs.push({ leadId: lead.id, pfId: pf.id, amount: q.amount, name: q.name });
  }

  try {
    const first = seedPfs[0];
    if (first) await payAndVerify(page, first.leadId, first.pfId, first.amount);
    const second = seedPfs[1];
    if (second) await payAndVerify(page, second.leadId, second.pfId, '200.00');

    // ── Desktop ───────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(page.getByRole('heading', { name: 'Services & Billing' })).toBeVisible({
      timeout: 15_000,
    });
    // Header card actions.
    await expect(page.getByRole('button', { name: '+ New quote' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create Pro Forma' }).first()).toBeVisible();
    // Available-services picker with the seeded, described services.
    await expect(page.getByRole('heading', { name: 'Available services' })).toBeVisible();
    await expect(
      page.getByText('Professional CV writing and cover letter preparation').first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add service' }).first()).toBeVisible();
    // Active services column + the create-new-service action card.
    await expect(page.getByText(/Active services for this candidate/).first()).toBeVisible();
    // Stage C1 — settled rows read "Paid" (shared three-state labels).
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Awaiting payment').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Direct Payment & Activate/ })).toBeVisible();
    // Service history table rows: paid, partially paid, in progress.
    await expect(page.getByRole('heading', { name: /Service history/ })).toBeVisible();
    await expect(page.locator('tbody').getByText('Paid').first()).toBeVisible();
    await expect(page.locator('tbody').getByText('Partially paid').first()).toBeVisible();
    await expect(page.locator('tbody').getByText('Awaiting payment').first()).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen06-desktop-${stamp}.png`),
      fullPage: true,
    });
    // The app shell scrolls an inner container, so fullPage stops at the
    // viewport — re-capture with a tall viewport to get the whole tab.
    await page.setViewportSize({ width: 1440, height: 2800 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen06-desktop-tall-${stamp}.png`),
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Picker interaction: selecting a service pre-fills the dedicated
    // Create Pro Forma page (Screen 08) via ?services=….
    const pickCard = page.getByRole('button', { name: 'Add service' }).first();
    await pickCard.click();
    await expect(page.getByRole('button', { name: 'Selected ✓' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Create Pro Forma' }).first().click();
    await expect(page).toHaveURL(/create-pro-forma\?services=/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Create Pro Forma' })).toBeVisible();
    await expect(page.getByText('Invoice Summary')).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen06-to-08-prefill-${stamp}.png`),
    });
    await page.goBack();

    // ── Mobile ────────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(page.getByRole('heading', { name: 'Services & Billing' })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen06-mobile-${stamp}.png`),
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
    if (catalogueIds.length > 0)
      await db
        .delete(schemas.serviceCatalogItems)
        .where(m.inArray(schemas.serviceCatalogItems.id, catalogueIds));
    await db.delete(schemas.serviceCategories).where(eq(schemas.serviceCategories.id, category.id));
  }
});
