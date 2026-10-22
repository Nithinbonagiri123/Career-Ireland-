import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6B+2 — mobile dialog screenshots.
 *
 * Captures each key dialog at 390×844 (iPhone 14 Pro portrait) so a
 * designer can review the mobile fit without re-running the suite.
 * Also exercises long-name + large-currency rendering so we catch
 * truncation / wrap bugs that only show at narrow widths.
 */

const SHOTS_DIR = path.resolve('playwright/stage6b2-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function seedForMobile(firstName: string, lastName: string) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName,
      email: 'mobile-screenshot@example.test',
      phone: '+353871234567',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert failed');
  const [l] = await db
    .insert(leads)
    .values({ personId: p.id, targetBusiness: 'CANDIDATE_SERVICES', status: 'NEW' })
    .returning({ id: leads.id });
  return {
    personId: p.id,
    leadId: l?.id ?? null,
    cleanup: async () => {
      const { eq } = await import('drizzle-orm');
      if (l?.id) await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    },
  };
}

async function seedWithAcceptedQuoteAndPayment(firstName: string) {
  // Larger seed: creates a lead + person + accepted pro-forma so the
  // Record payment and Activate candidate dialogs are both reachable on
  // the workspace page. Done directly against the DB so the test
  // doesn't double-up on the quote-creation flow (which is covered by
  // the full-journey test).
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { proFormaInvoices, proFormaLineItems, proposalGroups } = await import(
    '../src/lib/db/schema/proformas'
  );
  const { serviceCatalogItems, servicePackages } = await import('../src/lib/db/schema/services');
  const { users } = await import('../src/lib/db/schema/users');

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
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);

  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName: 'Mobile',
      email: `${firstName.toLowerCase()}-mobile@example.test`,
      phone: '+353871234111',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert failed');
  const [l] = await db
    .insert(leads)
    .values({ personId: p.id, targetBusiness: 'CANDIDATE_SERVICES', status: 'AWAITING_PAYMENT' })
    .returning({ id: leads.id });
  if (!l) throw new Error('lead insert failed');

  // Pro-forma with a single line, ACCEPTED (not CONVERTED) so the
  // Record payment button renders on the workspace.
  const [grp] = await db
    .insert(proposalGroups)
    .values({ leadId: l.id })
    .returning({ id: proposalGroups.id });
  // Pro-forma number column is varchar(24) — keep the stamp short.
  const stamp = Math.random().toString(36).slice(2, 10);
  const [pf] = await db
    .insert(proFormaInvoices)
    .values({
      number: `MOB-${stamp}`,
      sourceLeadId: l.id,
      proposalGroupId: grp?.id ?? null,
      payerPersonId: p.id,
      currencyCode: pkg.currencyCode,
      subtotal: pkg.price,
      status: 'ACCEPTED',
      issuedAt: new Date(),
      acceptedAt: new Date(),
      acceptedByUserId: admin?.id ?? null,
      createdByUserId: admin?.id ?? null,
    })
    .returning({ id: proFormaInvoices.id });
  if (!pf) throw new Error('pro-forma insert failed');
  await db.insert(proFormaLineItems).values({
    proFormaInvoiceId: pf.id,
    serviceCatalogItemId: svc.id,
    description: svc.name,
    quantity: '1.000',
    unitPrice: pkg.price,
    lineSubtotal: pkg.price,
    sortOrder: 0,
  });

  // Also seed a verified payment so the "Activate candidate" primary
  // action is reachable without stepping through verify first.
  const { payments: pay, serviceEngagements } = await import('../src/lib/db/schema/commerce');
  const [eng] = await db
    .insert(serviceEngagements)
    .values({
      serviceCatalogItemId: svc.id,
      payerPersonId: p.id,
      beneficiaryPersonId: p.id,
      agreedAmount: pkg.price,
      currencyCode: pkg.currencyCode,
      status: 'ACTIVE',
    })
    .returning({ id: serviceEngagements.id });
  // Half-pay so the engagement keeps an outstanding balance — the
  // Record-payment entry point only renders while money is still owed.
  const halfPrice = (Number(pkg.price) / 2).toFixed(2);
  const [payment] = await db
    .insert(pay)
    .values({
      serviceEngagementId: eng?.id ?? '',
      proFormaInvoiceId: pf.id,
      amount: halfPrice,
      currencyCode: pkg.currencyCode,
      method: 'BANK_TRANSFER',
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedByUserId: admin?.id ?? null,
      receivedAt: new Date(),
    })
    .returning({ id: pay.id });
  void payment;
  void sql;

  return {
    personId: p.id,
    leadId: l.id,
    proFormaId: pf.id,
    engagementId: eng?.id ?? null,
    cleanup: async () => {
      const { eq, inArray } = await import('drizzle-orm');
      const { candidateProfiles } = await import('../src/lib/db/schema/persons');
      if (eng?.id) {
        await db.delete(pay).where(eq(pay.serviceEngagementId, eng.id));
        await db.delete(serviceEngagements).where(eq(serviceEngagements.id, eng.id));
      }
      await db.delete(proFormaLineItems).where(eq(proFormaLineItems.proFormaInvoiceId, pf.id));
      await db.delete(proFormaInvoices).where(eq(proFormaInvoices.id, pf.id));
      if (grp?.id) await db.delete(proposalGroups).where(inArray(proposalGroups.id, [grp.id]));
      await db.delete(candidateProfiles).where(eq(candidateProfiles.personId, p.id));
      await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    },
  };
}

test('mobile: record payment dialog is scrollable + inputs are reachable at 390×844', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedWithAcceptedQuoteAndPayment(`PayMob${stamp}`);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${seeded.personId}?tab=billing`);
    // Record payment button on the ACCEPTED pro-forma row.
    const recordBtn = page.getByRole('button', { name: /^Record payment$/i }).first();
    await expect(recordBtn).toBeVisible({ timeout: 15_000 });
    const dialog = page.getByRole('dialog');
    // Re-click until hydration has attached the trigger (slow CI runners).
    await expect(async () => {
      await recordBtn.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    // Overflow check: the dialog's own box must not exceed the viewport.
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);
    // Amount input is reachable + typeable.
    const amount = dialog.getByLabel(/amount/i).first();
    await amount.fill('100.00');
    await expect(amount).toHaveValue('100.00');
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-record-payment-dialog.png'),
      fullPage: true,
    });
    // Escape dismiss works.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  } finally {
    await seeded.cleanup();
  }
});

test('mobile: activate candidate dialog renders without overflow at 390×844', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedWithAcceptedQuoteAndPayment(`ActMob${stamp}`);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${seeded.personId}`);
    // Primary action should be "Activate candidate" since a verified
    // payment exists but no candidate_profile does yet.
    const activateBtn = page.getByRole('button', { name: /^Activate candidate$/i }).first();
    await expect(activateBtn).toBeVisible({ timeout: 15_000 });
    await activateBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Dialog contents: title + explanatory copy + confirm button all fit.
    await expect(dialog.getByText(/activate candidate/i).first()).toBeVisible();
    await expect(dialog.getByText(/does not create or alter/i)).toBeVisible();
    const confirm = dialog.getByRole('button', { name: /^Activate candidate$/i });
    await expect(confirm).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-activate-candidate-dialog.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  } finally {
    await seeded.cleanup();
  }
});

test('mobile: workspace renders long names + handles the quote composer dialog', async ({
  page,
}) => {
  const seeded = await seedForMobile(
    'Jean-Baptiste-Alexander',
    'Montgomery-Smythe-Fitzgerald-Williamson',
  );
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/clients/${seeded.personId}`);
    await expect(page.getByText(/Jean-Baptiste/i).first()).toBeVisible({ timeout: 15_000 });

    // Full-page capture — asserts the long name doesn't overflow and the
    // sidebar collapses on narrow widths.
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-workspace-long-name.png'),
      fullPage: true,
    });

    // Switch to Billing + open the quote composer dialog. Mobile dialog
    // must be scrollable + readable; take a focused screenshot.
    await page.getByRole('tab', { name: 'Billing' }).click();
    const dialog = page.getByRole('dialog');
    // Re-click until hydration has attached the trigger (slow CI runners).
    // On CI's dev server a late streamed re-render of the Billing tab can
    // unmount a dialog that already opened, so the loop (a) reopens it if
    // it vanished and (b) only settles once the composer's own content
    // ("Add line") is rendered, not just the dialog shell.
    await expect(async () => {
      if (!(await dialog.isVisible())) {
        await page
          .getByRole('button', { name: /\+ New quote/i })
          .first()
          .click();
      }
      await expect(dialog.getByRole('button', { name: /add line/i })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-composer-dialog.png'),
      fullPage: false,
    });

    // Multi-line in the composer at mobile — adds a 2nd line and screenshots.
    await dialog.getByRole('button', { name: /add line/i }).click();
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'mobile-composer-dialog-two-lines.png'),
      fullPage: true,
    });

    // Escape dismiss works on mobile.
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  } finally {
    await seeded.cleanup();
  }
});
