import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 09 — "Accept Payment & Create Candidate" (the
 * /candidates/new intake flow restyled as the approved 4-step card) vs
 * designs/APPROVED_DESIGNS/09_Accept_Payment_Create_Candidate_APPROVED.png.
 *
 * Fills the four steps like the mockup (customer → payment → services
 * → summary), captures the card, then submits and verifies the full
 * business outcome: candidate created Active with invoice + receipt.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray, like } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const leads = await import('../src/lib/db/schema/leads');
  const commerce = await import('../src/lib/db/schema/commerce');
  const billing = await import('../src/lib/db/schema/billing');
  const servicesSchema = await import('../src/lib/db/schema/services');
  return {
    db,
    eq,
    and,
    inArray,
    like,
    schemas: { ...persons, ...leads, ...commerce, ...billing, ...servicesSchema },
  };
}

test('stage 6G screen 09 — accept payment & create candidate matches the approved layout', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const email = `george-09-${stamp}@example.test`;

  const catalogueSeed: ReadonlyArray<readonly [string, string, string]> = [
    [
      `CV & Cover Letter (${stamp})`,
      'Professional CV writing and cover letter preparation',
      '300.00',
    ],
    [`Job Search Support (${stamp})`, 'Guidance and support with job search in Ireland', '500.00'],
  ];
  const catalogueIds: string[] = [];
  for (let i = 0; i < catalogueSeed.length; i++) {
    const [name, description, price] = catalogueSeed[i] as readonly [string, string, string];
    const [item] = await m.db
      .insert(m.schemas.serviceCatalogItems)
      .values({
        code: `VIS09_${stamp}_${i}`,
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

  let personId: string | null = null;
  try {
    await page.setViewportSize({ width: 1440, height: 2200 });
    await page.goto('/candidates/new');
    await page.waitForURL(/\/candidates\/new\?draft=[0-9a-f-]+/i, { timeout: 60_000 });

    // Step anchors.
    await expect(page.getByText('Accept Payment & Create Candidate').first()).toBeVisible();
    await expect(page.getByText('Customer details')).toBeVisible();
    await expect(page.getByText('Payment details')).toBeVisible();
    await expect(page.getByText('Services included')).toBeVisible();
    await expect(page.getByText('Create candidate profile')).toBeVisible();
    await expect(page.getByText('Candidate profile will be created as Active')).toBeVisible();

    // Step 1 — customer details.
    await page.getByLabel(/first name/i).fill('George');
    await page.getByLabel(/last name/i).fill(`Lugalo-${stamp}`);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/phone/i).fill('+27821234567');
    await page.getByLabel(/nationality/i).fill('South African');
    await page.getByLabel(/country of residence/i).fill('South Africa');
    await page.getByLabel(/irish immigration status/i).selectOption('NONE');

    // Step 3 — tick both seeded services; the total (800) auto-fills
    // the amount received.
    await page.getByRole('checkbox', { name: `Include CV & Cover Letter (${stamp})` }).check();
    await page.getByRole('checkbox', { name: `Include Job Search Support (${stamp})` }).check();
    await expect(page.getByLabel(/amount received/i)).toHaveValue('800.00');
    await expect(page.getByText('€800.00').first()).toBeVisible();

    // Step 2 — reference.
    await page.getByLabel(/reference number/i).fill(`TXN-${stamp.toUpperCase()}512`);

    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen09-desktop-${stamp}.png`) });

    // Submit — candidate created Active, invoice + receipt issued.
    await page.getByRole('button', { name: /accept payment & create candidate/i }).click();
    await page.waitForURL(/\/(candidates|clients)\/[0-9a-f-]+\?just_created=1/i, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole('heading', { name: new RegExp(`George Lugalo-${stamp}`, 'i') }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /view invoice/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /view receipt/i })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen09-after-create-${stamp}.png`),
      fullPage: true,
    });

    const [created] = await m.db
      .select({ id: m.schemas.persons.id })
      .from(m.schemas.persons)
      .where(m.eq(m.schemas.persons.email, email))
      .limit(1);
    personId = created?.id ?? null;
    expect(personId).toBeTruthy();

    // The invoice line names the selected services (not the generic
    // onboarding item).
    if (personId) {
      const [inv] = await m.db
        .select({ id: m.schemas.invoices.id })
        .from(m.schemas.invoices)
        .where(m.eq(m.schemas.invoices.payerPersonId, personId))
        .limit(1);
      expect(inv).toBeTruthy();
      if (inv) {
        const lines = await m.db
          .select({ description: m.schemas.invoiceLineItems.description })
          .from(m.schemas.invoiceLineItems)
          .where(m.eq(m.schemas.invoiceLineItems.invoiceId, inv.id));
        expect(lines.map((l) => l.description).join(' ')).toContain(
          `CV & Cover Letter (${stamp}) + Job Search Support (${stamp})`,
        );
      }
    }
  } finally {
    const { eq, schemas, db } = m;
    if (!personId) {
      const [maybe] = await db
        .select({ id: schemas.persons.id })
        .from(schemas.persons)
        .where(eq(schemas.persons.email, email))
        .limit(1);
      personId = maybe?.id ?? null;
    }
    if (personId) {
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
          await db.delete(schemas.invoices).where(m.inArray(schemas.invoices.id, invIds));
        }
        await db
          .delete(schemas.payments)
          .where(m.inArray(schemas.payments.serviceEngagementId, engIds));
        await db
          .delete(schemas.serviceEngagements)
          .where(m.inArray(schemas.serviceEngagements.id, engIds));
      }
      await db.delete(schemas.leads).where(eq(schemas.leads.personId, personId));
      await db
        .delete(schemas.candidateProfiles)
        .where(eq(schemas.candidateProfiles.personId, personId));
      await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
    }
    if (catalogueIds.length > 0)
      await db
        .delete(schemas.serviceCatalogItems)
        .where(m.inArray(schemas.serviceCatalogItems.id, catalogueIds));
  }
});
