import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6G Screen 10 — Direct Payment & Convert dialog (4-step card
 * with method tabs) + the Official Invoice detail page (header card,
 * Overview / Payments / Related records tabs, payment-received
 * banner) vs designs/APPROVED_DESIGNS/10_Official_Invoice_APPROVED.png.
 *
 * Walks the real flow: seeded CS lead → dialog (two services, Card
 * tab, terminal reference) → invoice + receipt issued + candidate
 * activated → invoice page tabs verified.
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
    },
  };
}

test('stage 6G screen 10 — direct payment dialog + official invoice page match the approved layout', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();

  const catalogueSeed: ReadonlyArray<readonly [string, string, string]> = [
    [
      `CV & Cover Letter S10-${stamp}`,
      'Professional CV writing and cover letter preparation',
      '300.00',
    ],
    [
      `Job Search Support S10-${stamp}`,
      'Guidance and support with job search in Ireland',
      '500.00',
    ],
  ];
  const catalogueIds: string[] = [];
  for (let i = 0; i < catalogueSeed.length; i++) {
    const [name, description, price] = catalogueSeed[i] as readonly [string, string, string];
    const [item] = await m.db
      .insert(m.schemas.serviceCatalogItems)
      .values({
        code: `VIS10_${stamp}_${i}`,
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
      lastName: `Lugalo-S10${stamp}`,
      email: `george-10-${stamp}@example.test`,
      phone: '+27821234569',
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

  const terminalRef = `TERM-${stamp.toUpperCase()}-4242`;
  try {
    // ── Dialog ────────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/leads?assigned=all');
    const row = page.locator('tr', { hasText: new RegExp(`Lugalo-S10${stamp}`, 'i') }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /Direct Payment & Convert/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Direct Payment & Convert to Candidate')).toBeVisible();
    await expect(dialog.getByText('Candidate information')).toBeVisible();
    await expect(dialog.getByText('Select services')).toBeVisible();
    await expect(dialog.getByText('Payment details')).toBeVisible();
    await expect(dialog.getByText('Confirmation')).toBeVisible();
    // No raw card inputs anywhere — card data is never collected.
    await expect(dialog.getByText(/no card details are entered or stored/i)).toBeVisible();
    expect(await dialog.locator('input[autocomplete*="cc-"]').count()).toBe(0);

    // Clear the default pre-selection, then pick both seeded services
    // → total 800.
    const preChecked = dialog.locator('input[type="checkbox"]:checked');
    while ((await preChecked.count()) > 0) {
      await preChecked.first().uncheck();
    }
    await dialog.getByRole('checkbox', { name: `Include CV & Cover Letter S10-${stamp}` }).check();
    await dialog.getByRole('checkbox', { name: `Include Job Search Support S10-${stamp}` }).check();
    await expect(dialog.getByText('€800.00')).toBeVisible();
    // Card tab is the default; record the terminal reference.
    await expect(dialog.getByRole('button', { name: 'Card payment' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByLabel(/Reference number/i).fill(terminalRef);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen10-dialog-${stamp}.png`) });

    await dialog
      .getByRole('button', { name: /Process payment, create invoice and convert/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/clients/${personId}`), { timeout: 20_000 });

    // ── Official invoice page ─────────────────────────────────────
    const [inv] = await m.db
      .select({ number: m.schemas.invoices.number })
      .from(m.schemas.invoices)
      .where(m.eq(m.schemas.invoices.payerPersonId, personId))
      .limit(1);
    expect(inv).toBeTruthy();
    if (!inv) throw new Error('invoice missing');
    await page.goto(`/candidates/${personId}/invoices/${inv.number}`);
    await expect(
      page.getByRole('heading', { name: new RegExp(`Invoice ${inv.number}`) }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Paid').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Payments (1)' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Related records' })).toBeVisible();
    await expect(page.getByText('Payment received').first()).toBeVisible();
    await expect(page.getByText(terminalRef).first()).toBeVisible();
    // Invoice line names both services.
    await expect(
      page.getByText(`CV & Cover Letter S10-${stamp} + Job Search Support S10-${stamp}`).first(),
    ).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `screen10-invoice-${stamp}.png`),
      fullPage: true,
    });

    // Payments tab shows the CARD payment + receipt number.
    await page.getByRole('tab', { name: 'Payments (1)' }).click();
    await expect(page.getByText(new RegExp(`CARD · ref ${terminalRef}`)).first()).toBeVisible();
    await expect(page.getByText(/RCT-/).first()).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen10-payments-tab-${stamp}.png`) });

    // Related records tab links back to the workspace + receipt.
    await page.getByRole('tab', { name: 'Related records' }).click();
    await expect(page.getByText('Candidate workspace')).toBeVisible();
    await expect(page.getByText(/Receipt RCT-/).first()).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS_DIR, `screen10-related-tab-${stamp}.png`) });
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
    if (catalogueIds.length > 0)
      await db
        .delete(schemas.serviceCatalogItems)
        .where(m.inArray(schemas.serviceCatalogItems.id, catalogueIds));
  }
});
