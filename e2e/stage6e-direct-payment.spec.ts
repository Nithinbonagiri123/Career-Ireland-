import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6E Section 7 + Stage 6E+1 Section 4 — Direct Payment & Convert
 * acceptance scenarios. One spec covers all six journeys so the DB
 * seed/cleanup helpers are shared.
 *
 * A. Cash with blank reference → receipt prints no reference label.
 * B. Bank transfer with a reference → reference stored on the payment
 *    and surfaced in the client workspace billing timeline.
 * C. "Other" (card payment, operator types the card ref) → stored as
 *    OTHER on the DB column with the operator's reference printed on
 *    the receipt. Validates the Stage 6E+1 CARD-to-OTHER correction:
 *    the UI no longer presents a misleading "Card" option; "Other" is
 *    the one honest value and the reference carries the specificity.
 * D. Cash blank reference → invoice + receipt + conversion in one step.
 * E. Duplicate detection → the second attempt against an existing live
 *    invoice/pro-forma for the same service is refused; override with
 *    a reason proceeds.
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
    .values({
      assignedUserId: await e2eAdminId(),
      personId: p.id,
      targetBusiness: 'CANDIDATE_SERVICES',
      status: 'NEW',
    })
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
    await dialog.getByRole('button', { name: 'Cash' }).click();
    // Values prefilled from the service's first package. Submit as-is.
    await dialog
      .getByRole('button', { name: /Process payment, create invoice and convert/i })
      .click();

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
    const submit = dialog.getByRole('button', {
      name: /Process payment, create invoice and convert/i,
    });
    await Promise.all([submit.click(), submit.click().catch(() => {})]);

    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });
    const counts = await countForPerson(seeded.personId);
    expect(counts).toEqual({ invoices: 1, payments: 1, receipts: 1, profiles: 1 });
  } finally {
    await seeded.cleanup();
  }
});

async function latestPaymentForPerson(personId: string): Promise<{
  method: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER';
  proofReference: string | null;
} | null> {
  const { desc, eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { payments: pay, serviceEngagements } = await import('../src/lib/db/schema/commerce');
  const engs = await db
    .select({ id: serviceEngagements.id })
    .from(serviceEngagements)
    .where(eq(serviceEngagements.beneficiaryPersonId, personId));
  const engIds = engs.map((e) => e.id);
  if (engIds.length === 0) return null;
  const [p] = await db
    .select({ method: pay.method, proofReference: pay.proofReference })
    .from(pay)
    .where(inArray(pay.serviceEngagementId, engIds))
    .orderBy(desc(pay.createdAt))
    .limit(1);
  return p ?? null;
}

async function openDirectPaymentDialog(
  page: import('@playwright/test').Page,
  stampSubstring: string,
) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/leads?assigned=all');
  const row = page.locator('tr', { hasText: new RegExp(stampSubstring, 'i') }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: /Direct Payment & Convert/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('A: cash with blank reference → receipt stores no reference', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedCsLeadWithService(`CA${stamp}`);
  try {
    const dialog = await openDirectPaymentDialog(page, `CA${stamp}`);
    await dialog.getByRole('button', { name: 'Cash' }).click();
    // Reference stays blank.
    await dialog
      .getByRole('button', { name: /Process payment, create invoice and convert/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });

    const latest = await latestPaymentForPerson(seeded.personId);
    expect(latest).not.toBeNull();
    expect(latest?.method).toBe('CASH');
    // Journey A asserts the field is explicitly null — not an empty
    // string, not " ", not a placeholder. The receipt renderer uses
    // this to omit the reference row entirely rather than printing
    // "Reference: —".
    expect(latest?.proofReference).toBeNull();
  } finally {
    await seeded.cleanup();
  }
});

test('B: bank transfer with reference → reference stored on payment', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedCsLeadWithService(`BT${stamp}`);
  const bankRef = `BANK-${stamp}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  try {
    const dialog = await openDirectPaymentDialog(page, `BT${stamp}`);
    await dialog.getByRole('button', { name: 'Bank transfer' }).click();
    await dialog.getByLabel(/Reference number/i).fill(bankRef);
    await dialog
      .getByRole('button', { name: /Process payment, create invoice and convert/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });

    const latest = await latestPaymentForPerson(seeded.personId);
    expect(latest).not.toBeNull();
    expect(latest?.method).toBe('BANK_TRANSFER');
    expect(latest?.proofReference).toBe(bankRef);
    // Workspace Billing row prints the reference verbatim so finance
    // can reconcile against the bank statement.
    await expect(page.getByText(bankRef)).toBeVisible({ timeout: 15_000 });
  } finally {
    await seeded.cleanup();
  }
});

test('C: Card with terminal ref → stored as CARD on DB, reference printed on receipt', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedCsLeadWithService(`OC${stamp}`);
  // Stage 6G Screen 10 — CARD is a first-class payments.method value.
  // The Card tab never collects card data; the operator records the
  // terminal / processor reference, and the receipt + billing
  // timeline print it verbatim.
  const stripeRef = `pi_3O${stamp}LMnrA${Date.now().toString(36).slice(-6)}`;
  try {
    const dialog = await openDirectPaymentDialog(page, `OC${stamp}`);
    await dialog.getByRole('button', { name: 'Card payment' }).click();
    await dialog.getByLabel(/Reference number/i).fill(stripeRef);
    await dialog
      .getByRole('button', { name: /Process payment, create invoice and convert/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });

    const latest = await latestPaymentForPerson(seeded.personId);
    expect(latest).not.toBeNull();
    expect(latest?.method).toBe('CARD');
    expect(latest?.proofReference).toBe(stripeRef);
    await expect(page.getByText(stripeRef)).toBeVisible({ timeout: 15_000 });
  } finally {
    await seeded.cleanup();
  }
});

test('E: duplicate detection → second attempt refused; override with reason proceeds', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedCsLeadWithService(`DU${stamp}`);
  try {
    // First successful attempt — creates an ISSUED invoice (then PAID
    // after recomputeInvoiceStatus) + the one-shot engagement.
    const dialog = await openDirectPaymentDialog(page, `DU${stamp}`);
    await dialog.getByRole('button', { name: 'Cash' }).click();
    await dialog
      .getByRole('button', { name: /Process payment, create invoice and convert/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });
    const firstCounts = await countForPerson(seeded.personId);
    expect(firstCounts).toEqual({ invoices: 1, payments: 1, receipts: 1, profiles: 1 });

    // Seed a second CS lead for the same person so we can retry the
    // Direct Payment flow — same person + same service = duplicate.
    const { db } = await import('../src/lib/db/client');
    const { leads: leadsTable } = await import('../src/lib/db/schema/leads');
    const [l2] = await db
      .insert(leadsTable)
      .values({
        personId: seeded.personId,
        targetBusiness: 'CANDIDATE_SERVICES',
        status: 'NEW',
      })
      .returning({ id: leadsTable.id });
    if (!l2) throw new Error('second lead insert failed');

    try {
      // The invoice from the first attempt was auto-flipped to PAID,
      // so the person-level duplicate signal is a stale ISSUED/PP
      // invoice OR an ACCEPTED/ISSUED pro-forma on *this* lead. We
      // create an ISSUED pro-forma on the second lead to trigger the
      // detector cleanly.
      const { proFormaInvoices } = await import('../src/lib/db/schema/proformas');
      await db.insert(proFormaInvoices).values({
        number: `PF-TEST-${stamp}-${Date.now().toString(36).slice(-5)}`,
        sourceLeadId: l2.id,
        payerPersonId: seeded.personId,
        currencyCode: seeded.currency,
        subtotal: seeded.price,
        status: 'ISSUED',
      });

      await page.goto('/leads?assigned=all');
      const row = page
        .locator('tr', { hasText: new RegExp(`DU${stamp}`, 'i') })
        .filter({ hasText: /Direct Payment & Convert/i })
        .first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.getByRole('button', { name: /Direct Payment & Convert/i }).click();
      const dialog2 = page.getByRole('dialog');
      await expect(dialog2).toBeVisible();
      await dialog2.getByRole('button', { name: 'Cash' }).click();
      await dialog2
        .getByRole('button', { name: /Process payment, create invoice and convert/i })
        .click();

      // Server rejects with DIRECT_PAYMENT_DUPLICATE_LIKELY. The
      // dialog surfaces the error inline and reveals the override box.
      const errBox = dialog2.getByText(/live invoice or quote already exists/i);
      await expect(errBox).toBeVisible({ timeout: 15_000 });

      // No new invoice/payment/receipt created.
      const afterRefused = await countForPerson(seeded.personId);
      expect(afterRefused).toEqual(firstCounts);

      // Override + resubmit succeeds.
      const overrideBox = dialog2.getByLabel(/Reason for proceeding despite a possible duplicate/i);
      await expect(overrideBox).toBeVisible();
      await overrideBox.fill('Client called in a second CS enrolment; billing agreed.');
      await dialog2
        .getByRole('button', { name: /Process payment, create invoice and convert/i })
        .click();
      await expect(page).toHaveURL(new RegExp(`/clients/${seeded.personId}`), { timeout: 15_000 });

      const after = await countForPerson(seeded.personId);
      expect(after.invoices).toBe(firstCounts.invoices + 1);
      expect(after.payments).toBe(firstCounts.payments + 1);
      expect(after.receipts).toBe(firstCounts.receipts + 1);
      expect(after.profiles).toBe(1); // one shared profile
    } finally {
      const { eq } = await import('drizzle-orm');
      const { proFormaInvoices } = await import('../src/lib/db/schema/proformas');
      await db.delete(proFormaInvoices).where(eq(proFormaInvoices.sourceLeadId, l2.id));
      await db.delete(leadsTable).where(eq(leadsTable.id, l2.id));
    }
  } finally {
    await seeded.cleanup();
  }
});
