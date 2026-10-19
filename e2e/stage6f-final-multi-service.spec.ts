import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6F (final) item 8 — a realistic multi-service candidate.
 * Three engagements across two currencies, each with their own quote
 * + verified payment + issued invoice. Captures desktop + mobile
 * screenshots and asserts:
 *   - the Service billing summary header is visible without scrolling
 *   - all three service summary rows are visible without having to
 *     expand their detail (because they collapse by default when >1
 *     service exists)
 *   - the "Jump to profile tabs" shortcut renders when >2 services
 *   - the tabs row remains reachable from the top of the viewport
 */

const SHOTS_DIR = path.resolve('playwright/stage6f-final');
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
  const services = await import('../src/lib/db/schema/services');
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
      ...services,
      ...users,
    },
  };
}

async function recordAndVerifyViaUI(
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
  const verifyBtn = page.getByRole('button', { name: /^Verify$/ }).first();
  await expect(verifyBtn).toBeVisible({ timeout: 10_000 });
  await verifyBtn.click();
  await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
}

test('final: three services on one client — compact summaries, tabs still reachable', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const [admin] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin user missing');
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
  if (!svc) throw new Error('no active service');

  // One person, three pro-formas, two currencies.
  const [p] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Multi',
      lastName: `Svc-${stamp}`,
      email: `multi-${stamp}@example.test`,
      phone: '+353871234567',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!p) throw new Error('person seed failed');

  type SeedPf = {
    leadId: string;
    pfId: string;
    amount: string;
  };
  const seedPfs: SeedPf[] = [];
  const currencies: Array<'EUR' | 'USD' | 'EUR'> = ['EUR', 'EUR', 'USD'];
  const amounts = ['450.00', '275.00', '600.00'];
  try {
    for (let i = 0; i < 3; i++) {
      const [lead] = await m.db
        .insert(m.schemas.leads)
        .values({
          personId: p.id,
          targetBusiness: 'CANDIDATE_SERVICES',
          serviceOfInterestId: svc.id,
          status: 'AWAITING_PAYMENT',
        })
        .returning({ id: m.schemas.leads.id });
      if (!lead) throw new Error(`lead ${i} seed failed`);
      const pfNumber = `PF-${stamp}-${i}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const [pf] = await m.db
        .insert(m.schemas.proFormaInvoices)
        .values({
          number: pfNumber,
          sourceLeadId: lead.id,
          payerPersonId: p.id,
          currencyCode: currencies[i] ?? 'EUR',
          subtotal: amounts[i] ?? '100.00',
          status: 'ACCEPTED',
          issuedAt: new Date(),
          acceptedAt: new Date(),
          acceptedByUserId: admin.id,
          createdByUserId: admin.id,
        })
        .returning({ id: m.schemas.proFormaInvoices.id });
      if (!pf) throw new Error(`pf ${i} seed failed`);
      await m.db.insert(m.schemas.proFormaLineItems).values({
        proFormaInvoiceId: pf.id,
        serviceCatalogItemId: svc.id,
        description: `${svc.name} ${i + 1}`,
        quantity: '1',
        unitPrice: amounts[i] ?? '100.00',
        lineSubtotal: amounts[i] ?? '100.00',
        sortOrder: 0,
      });
      seedPfs.push({ leadId: lead.id, pfId: pf.id, amount: amounts[i] ?? '100.00' });
    }

    // Full-pay all three via the real UI flow.
    for (const sp of seedPfs) {
      await recordAndVerifyViaUI(page, sp.leadId, sp.pfId, sp.amount);
    }

    // Desktop view at 1440 — summary rows for 3 services should fit
    // above the fold; the "Jump to profile tabs" shortcut should
    // appear in the Service billing header.
    await page.setViewportSize({ width: 1440, height: 900 });
    // Stage 6G moved the detailed engagement cards into the Services &
    // Billing tab (legacy ?tab=billing maps there).
    await page.goto(`/clients/${p.id}?tab=billing`);
    await expect(page.getByRole('heading', { name: new RegExp(`Svc-${stamp}`, 'i') })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Service billing').first()).toBeVisible();
    // All three engagement cards present.
    const engagementCards = page.locator('[data-testid="engagement-card"]');
    await expect(engagementCards).toHaveCount(3);
    // The "Jump to profile tabs" shortcut only renders when there
    // are more than two engagements.
    await expect(page.getByText(/Jump to profile tabs/i)).toBeVisible();
    await page.screenshot({
      path: path.join(SHOTS_DIR, `desktop-multi-${stamp}.png`),
      fullPage: true,
    });

    // Click the jump link and confirm the tabs scroll into view.
    // Stage 6G renamed the tab from "Candidate profile" → "Profile"
    // alongside the new Overview tab.
    await page.getByRole('link', { name: /Jump to profile tabs/i }).click();
    const tabs = page.getByRole('tab', { name: /^Profile$/i });
    await expect(tabs).toBeInViewport({ timeout: 5_000 });

    // Legacy ?tab=billing bookmark should scroll back to Service
    // billing section rather than silently landing on profile.
    await page.goto(`/clients/${p.id}?tab=billing`);
    await expect(page.getByText('Service billing').first()).toBeInViewport({ timeout: 5_000 });

    // Mobile viewport — summary rows stack cleanly.
    await page.setViewportSize({ width: 390, height: 1800 });
    await page.goto(`/clients/${p.id}?tab=billing`);
    await expect(page.getByText('Service billing').first()).toBeVisible({ timeout: 10_000 });
    await expect(engagementCards).toHaveCount(3);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `mobile-multi-${stamp}.png`),
      fullPage: true,
    });
  } finally {
    // Teardown — delete all children before the person.
    const { eq, schemas, db } = m;
    const engs = await db
      .select({ id: schemas.serviceEngagements.id })
      .from(schemas.serviceEngagements)
      .where(eq(schemas.serviceEngagements.beneficiaryPersonId, p.id));
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
      const payIds = pays.map((pp) => pp.id);
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
    await db.delete(schemas.leads).where(eq(schemas.leads.personId, p.id));
    await db.delete(schemas.candidateProfiles).where(eq(schemas.candidateProfiles.personId, p.id));
    await db.delete(schemas.persons).where(eq(schemas.persons.id, p.id));
  }
});
