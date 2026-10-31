import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6G Screen 08 — dedicated Create Pro Forma page vs
 * designs/APPROVED_DESIGNS/08_Create_Pro_Forma_APPROVED.png.
 *
 * Seeds a candidate with a CS lead plus described, priced catalogue
 * services, opens /clients/<id>/create-pro-forma?services=…, captures
 * the populated form, then walks the primary action: Create Pro Forma
 * → quote created AND issued → lands back on the Services & Billing
 * tab with the new quote visible.
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
  const proformas = await import('../src/lib/db/schema/proformas');
  const servicesSchema = await import('../src/lib/db/schema/services');
  return {
    db,
    eq,
    and,
    inArray,
    schemas: { ...persons, ...leads, ...proformas, ...servicesSchema },
  };
}

test('stage 6G screen 08 — create pro forma page matches the approved layout', async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

  const catalogueSeed = [
    ['CV & Cover Letter Review', 'Professional CV review and cover letter advice', '100.00'],
    ['Job Search Support', 'Guidance and job search support', '200.00'],
    ['Interview Preparation', 'Mock interviews and coaching', '250.00'],
  ] as const;
  const catalogueIds: string[] = [];
  for (let i = 0; i < catalogueSeed.length; i++) {
    const [name, description, price] = catalogueSeed[i] as (typeof catalogueSeed)[number];
    const [item] = await m.db
      .insert(m.schemas.serviceCatalogItems)
      .values({
        code: `VIS08_${stamp}_${i}`,
        name,
        description,
        defaultCurrencyCode: 'EUR',
        defaultPrice: price,
        payerType: 'PERSON',
        isActive: true,
      })
      .returning({ id: m.schemas.serviceCatalogItems.id });
    if (!item) throw new Error('catalog seed failed');
    catalogueIds.push(item.id);
  }

  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'George',
      lastName: `Lugalo-${stamp}`,
      email: `george-08-${stamp}@example.test`,
      phone: '+27821234568',
      nationality: 'South African',
      currentCountry: 'South Africa',
      currentCity: 'Cape Town',
      source: 'DIRECT',
      irishImmigrationStatus: 'NONE',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;
  const [lead] = await m.db
    .insert(m.schemas.leads)
    .values({
      assignedUserId: await e2eAdminId(),
      personId,
      targetBusiness: 'CANDIDATE_SERVICES',
      serviceOfInterestId: catalogueIds[0] as string,
      status: 'NEW',
    })
    .returning({ id: m.schemas.leads.id });
  if (!lead) throw new Error('lead seed failed');

  try {
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.goto(
      `/clients/${personId}/create-pro-forma?services=${catalogueIds[0]},${catalogueIds[1]}`,
    );
    await expect(page.getByRole('heading', { name: 'Create Pro Forma' })).toBeVisible({
      timeout: 15_000,
    });
    // Hero + breadcrumb + actions.
    await expect(page.getByRole('heading', { name: `George Lugalo-${stamp}` })).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Candidate/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /View Profile/ })).toBeVisible();
    // Form cards.
    await expect(page.getByText('Pro forma details')).toBeVisible();
    await expect(page.getByLabel('Payment terms')).toBeVisible();
    await expect(page.getByText('Candidate Information')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro forma summary' })).toBeVisible();
    // Preselected rows total 100 + 200 = 300.
    await expect(page.getByText('€300.00').first()).toBeVisible();
    await expect(
      page.getByText('This pro forma will not create a payment request', { exact: false }),
    ).toBeVisible();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen08-desktop-${stamp}.png`) });

    // Primary action: create + issue, then land on Services & Billing.
    await page.getByRole('button', { name: 'Create Pro Forma' }).click();
    await expect(page.getByText(/Pro forma \S+ issued/)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/clients/${personId}`), { timeout: 15_000 });
    await expect(page.getByText('Quote issued').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen08-after-create-${stamp}.png`),
      fullPage: true,
    });

    // ── Mobile ────────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${personId}/create-pro-forma?services=${catalogueIds[0]}`);
    await expect(page.getByRole('heading', { name: 'Create Pro Forma' })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen08-mobile-${stamp}.png`),
      fullPage: true,
    });
  } finally {
    const { eq, schemas, db } = m;
    const pfs = await db
      .select({ id: schemas.proFormaInvoices.id })
      .from(schemas.proFormaInvoices)
      .where(eq(schemas.proFormaInvoices.payerPersonId, personId));
    const pfIds = pfs.map((p) => p.id);
    if (pfIds.length > 0) {
      await db
        .delete(schemas.proFormaLineItems)
        .where(m.inArray(schemas.proFormaLineItems.proFormaInvoiceId, pfIds));
      await db
        .delete(schemas.proFormaInvoices)
        .where(m.inArray(schemas.proFormaInvoices.id, pfIds));
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
    await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
    if (catalogueIds.length > 0)
      await db
        .delete(schemas.serviceCatalogItems)
        .where(m.inArray(schemas.serviceCatalogItems.id, catalogueIds));
  }
});
