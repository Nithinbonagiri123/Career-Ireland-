import { expect, test } from '@playwright/test';

/**
 * Stage 6E Section 7 — Direct Payment & Convert acceptance scenarios.
 *
 * D. Direct cash payment with blank reference → invoice + receipt
 *    immediately, candidate converted.
 * F. Double-click / retry → no duplicate invoice, receipt, payment or
 *    candidate_profile.
 *
 * Admin project (ADMIN session) — the server action is ADMIN/FINANCE
 * only; the UI button is hidden for STAFF so a dedicated STAFF test
 * isn't needed here (the role gate is proven in Stage 6B+2's vitest
 * role-gates test + Stage 6B+3's staff spec).
 */

async function seedCsLeadWithService(firstName: string) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { serviceCatalogItems, servicePackages } = await import('../src/lib/db/schema/services');

  const [svc] = await db
    .select({ id: serviceCatalogItems.id, name: serviceCatalogItems.name })
    .from(serviceCatalogItems)
    .where(and(eq(serviceCatalogItems.isActive, true), eq(serviceCatalogItems.payerType, 'PERSON')))
    .limit(1);
  if (!svc) throw new Error('no active person-payable service in test DB');
  const [pkg] = await db
    .select({ price: servicePackages.price, currencyCode: servicePackages.currencyCode })
    .from(servicePackages)
    .where(eq(servicePackages.serviceCatalogItemId, svc.id))
    .limit(1);
  if (!pkg) throw new Error('selected service has no package in test DB');

  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName: 'DirectPay',
      email: `${firstName.toLowerCase()}-directpay@example.test`,
      phone: '+27821234567',
      currentCity: 'Cape Town',
      currentCountry: 'South Africa',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert failed');

  const [l] = await db
    .insert(leads)
    .values({ personId: p.id, targetBusiness: 'CANDIDATE_SERVICES', status: 'NEW' })
    .returning({ id: leads.id });
  if (!l) throw new Error('lead insert failed');

  return {
    personId: p.id,
    leadId: l.id,
    serviceId: svc.id,
    serviceName: svc.name,
    price: pkg.price,
    currency: pkg.currencyCode,
    cleanup: async () => {
      const { candidateProfiles } = await import('../src/lib/db/schema/persons');
      const { payments, serviceEngagements } = await import('../src/lib/db/schema/commerce');
      const { invoices, invoiceLineItems, receipts } = await import('../src/lib/db/schema/billing');
      const { inArray } = await import('drizzle-orm');

      const engs = await db
        .select({ id: serviceEngagements.id })
        .from(serviceEngagements)
        .where(eq(serviceEngagements.beneficiaryPersonId, p.id));
      const engIds = engs.map((e) => e.id);
      if (engIds.length > 0) {
        const invs = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(inArray(invoices.serviceEngagementId, engIds));
        const invIds = invs.map((i) => i.id);
        const pays = await db
          .select({ id: payments.id })
          .from(payments)
          .where(inArray(payments.serviceEngagementId, engIds));
        const payIds = pays.map((pp) => pp.id);
        if (payIds.length > 0) {
          await db.delete(receipts).where(inArray(receipts.paymentId, payIds));
        }
        if (invIds.length > 0) {
          await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invIds));
          await db.delete(invoices).where(inArray(invoices.id, invIds));
        }
        await db.delete(payments).where(inArray(payments.serviceEngagementId, engIds));
        await db.delete(serviceEngagements).where(inArray(serviceEngagements.id, engIds));
      }
      await db.delete(candidateProfiles).where(eq(candidateProfiles.personId, p.id));
      await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    },
  };
}

async function countForPerson(personId: string): Promise<{
  invoices: number;
  payments: number;
  receipts: number;
  profiles: number;
}> {
  const { eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { payments: pay, serviceEngagements } = await import('../src/lib/db/schema/commerce');
  const { invoices, receipts } = await import('../src/lib/db/schema/billing');
  const { candidateProfiles } = await import('../src/lib/db/schema/persons');

  const engs = await db
    .select({ id: serviceEngagements.id })
    .from(serviceEngagements)
    .where(eq(serviceEngagements.beneficiaryPersonId, personId));
  const engIds = engs.map((e) => e.id);
  if (engIds.length === 0) {
    const [cp] = await db
      .select({ n: sql<string>`COUNT(*)::text` })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, personId));
    return { invoices: 0, payments: 0, receipts: 0, profiles: Number(cp?.n ?? 0) };
  }
  const [invCount] = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(invoices)
    .where(inArray(invoices.serviceEngagementId, engIds));
  const [payCount] = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(pay)
    .where(inArray(pay.serviceEngagementId, engIds));
  const invs = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(inArray(invoices.serviceEngagementId, engIds));
  const invIds = invs.map((i) => i.id);
  const [rcpCount] =
    invIds.length > 0
      ? await db
          .select({ n: sql<string>`COUNT(*)::text` })
          .from(receipts)
          .where(inArray(receipts.invoiceId, invIds))
      : [{ n: '0' }];
  const [cpCount] = await db
    .select({ n: sql<string>`COUNT(*)::text` })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, personId));
  return {
    invoices: Number(invCount?.n ?? 0),
    payments: Number(payCount?.n ?? 0),
    receipts: Number(rcpCount?.n ?? 0),
    profiles: Number(cpCount?.n ?? 0),
  };
}

test('D: direct cash payment with blank reference → invoice + receipt + conversion in one step', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedCsLeadWithService(`DP${stamp}`);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Leads page defaults to "Assigned to me"; our seeded lead has no
    // assignee so the default filter would hide it. ?assigned=all shows
    // the full workspace list.
    await page.goto('/leads?assigned=all');
    // Find the row for our seeded lead and open Direct Payment & Convert.
    // The ADMIN project sees both buttons on the CS row. Scope by the
    // seeded name text so we only match our row.
    const row = page.locator('tr', { hasText: new RegExp(`DP${stamp}`, 'i') }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /Direct Payment & Convert/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Direct Payment & Convert/i).first()).toBeVisible();

    // Switch to Cash and leave reference blank.
    await dialog.getByLabel(/Method/i).selectOption('CASH');
    // Values prefilled from the service's first package. Submit as-is.
    await dialog.getByRole('button', { name: /Record payment & convert/i }).click();

    // On success the toast says "Invoice INV-… / receipt RCT-… issued"
    // and we're redirected to the workspace Billing tab.
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });

    // Verify DB: exactly 1 invoice, 1 payment, 1 receipt, 1 profile.
    const counts = await countForPerson(seeded.personId);
    expect(counts).toEqual({ invoices: 1, payments: 1, receipts: 1, profiles: 1 });
  } finally {
    await seeded.cleanup();
  }
});

test('F: double-click Record payment → still exactly one invoice/receipt/payment/profile (idempotent)', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedCsLeadWithService(`DD${stamp}`);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Leads page defaults to "Assigned to me"; our seeded lead has no
    // assignee so the default filter would hide it. ?assigned=all shows
    // the full workspace list.
    await page.goto('/leads?assigned=all');
    const row = page.getByRole('row', { name: new RegExp(`DD${stamp}`, 'i') }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /Direct Payment & Convert/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Rapid-fire two clicks. useTransition disables the button after
    // the first click, so the second click is a no-op visually — but
    // even if a user POSTed the action a second time from devtools, the
    // idempotencyKey on the audit event would return the first result.
    const submit = dialog.getByRole('button', { name: /Record payment & convert/i });
    await Promise.all([submit.click(), submit.click().catch(() => {})]);

    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });
    const counts = await countForPerson(seeded.personId);
    expect(counts).toEqual({ invoices: 1, payments: 1, receipts: 1, profiles: 1 });
  } finally {
    await seeded.cleanup();
  }
});
