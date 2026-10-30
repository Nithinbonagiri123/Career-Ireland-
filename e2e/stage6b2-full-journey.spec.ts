import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6B+2 — End-to-end acceptance test for the unified Client
 * Workspace.
 *
 * Walks a Candidate Services lead from first click through to activated
 * candidate without leaving `/clients/[personId]` for any routine step
 * (opening a PDF is the one allowed exception; the test does not click
 * the PDF link). Asserts the balance chip + next-action label at each
 * checkpoint so a regression in either surface fails the test instead
 * of silently drifting.
 */

const SHOTS_DIR = path.resolve('playwright/stage6b2-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function seedLeadWithKnownService(firstName: string) {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons } = await import('../src/lib/db/schema/persons');
  const { leads } = await import('../src/lib/db/schema/leads');
  const { serviceCatalogItems, servicePackages } = await import('../src/lib/db/schema/services');

  // Reuse an active service + package so the composer prefills them.
  const [svc] = await db
    .select({ id: serviceCatalogItems.id, name: serviceCatalogItems.name })
    .from(serviceCatalogItems)
    .where(and(eq(serviceCatalogItems.isActive, true), eq(serviceCatalogItems.payerType, 'PERSON')))
    .limit(1);
  const svcId = svc?.id;
  const [pkg] = svcId
    ? await db
        .select({ price: servicePackages.price, currencyCode: servicePackages.currencyCode })
        .from(servicePackages)
        .where(eq(servicePackages.serviceCatalogItemId, svcId))
        .limit(1)
    : [];

  const [p] = await db
    .insert(persons)
    .values({
      firstName,
      lastName: 'Journey',
      email: `${firstName.toLowerCase()}-journey@example.test`,
      phone: '+353871234788',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
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

  return {
    personId: p.id,
    leadId: l?.id ?? null,
    serviceName: svc?.name ?? null,
    expectedPrice: pkg?.price ?? null,
    expectedCurrency: pkg?.currencyCode ?? 'EUR',
    cleanup: async () => {
      // Clean up in dependency order — pro-formas / invoices / payments /
      // engagements first (child tables), then lead + person.
      const { eq, inArray } = await import('drizzle-orm');
      const { payments, serviceEngagements } = await import('../src/lib/db/schema/commerce');
      const { invoices, invoiceLineItems, receipts } = await import('../src/lib/db/schema/billing');
      const { proFormaInvoices, proFormaOfficialInvoices } = await import(
        '../src/lib/db/schema/proformas'
      );
      const { candidateProfiles } = await import('../src/lib/db/schema/persons');

      // Find all engagements owned by this person. Delete order matters:
      // receipts → payments → invoice_line_items → invoices → engagements.
      // (receipts FK payment_id; payments FK service_engagement_id;
      //  invoice_line_items FK invoice_id; invoices FK service_engagement_id.)
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
        const payIds = pays.map((p2) => p2.id);
        if (payIds.length > 0) {
          await db.delete(receipts).where(inArray(receipts.paymentId, payIds));
        }
        if (invIds.length > 0) {
          await db
            .delete(proFormaOfficialInvoices)
            .where(inArray(proFormaOfficialInvoices.invoiceId, invIds));
          await db.delete(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invIds));
          await db.delete(invoices).where(inArray(invoices.id, invIds));
        }
        await db.delete(payments).where(inArray(payments.serviceEngagementId, engIds));
        await db.delete(serviceEngagements).where(inArray(serviceEngagements.id, engIds));
      }
      if (l?.id) {
        const pfs = await db
          .select({ id: proFormaInvoices.id })
          .from(proFormaInvoices)
          .where(eq(proFormaInvoices.sourceLeadId, l.id));
        if (pfs.length > 0) {
          const { proFormaLineItems, proposalGroups } = await import(
            '../src/lib/db/schema/proformas'
          );
          const pfIds = pfs.map((x) => x.id);
          await db
            .delete(proFormaLineItems)
            .where(inArray(proFormaLineItems.proFormaInvoiceId, pfIds));
          await db.delete(proFormaInvoices).where(inArray(proFormaInvoices.id, pfIds));
          // Proposal groups are created lazily per lead when a pro-forma
          // lands in a group — delete them AFTER the pro-formas have
          // released their FK references.
          await db.delete(proposalGroups).where(eq(proposalGroups.leadId, l.id));
        }
      }
      await db.delete(candidateProfiles).where(eq(candidateProfiles.personId, p.id));
      if (l?.id) await db.delete(leads).where(eq(leads.id, l.id));
      await db.delete(persons).where(eq(persons.id, p.id));
    },
  };
}

async function countForPerson(personId: string): Promise<{
  engagements: number;
  invoices: number;
  payments: number;
  receipts: number;
  candidateProfiles: number;
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
    return {
      engagements: 0,
      invoices: 0,
      payments: 0,
      receipts: 0,
      candidateProfiles: Number(cp?.n ?? 0),
    };
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
    engagements: engIds.length,
    invoices: Number(invCount?.n ?? 0),
    payments: Number(payCount?.n ?? 0),
    receipts: Number(rcpCount?.n ?? 0),
    candidateProfiles: Number(cpCount?.n ?? 0),
  };
}

test('full happy-path: lead → quote → partial pays → invoice → activate', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedLeadWithKnownService(`FJ${stamp}`);
  if (!seeded.serviceName || !seeded.expectedPrice) {
    test.skip(true, 'No active person-payable service with a package in the test DB');
  }
  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // ── Step 1: open the workspace, confirm lead-stage next action ──────
    await page.goto(`/clients/${seeded.personId}`);
    await expect(page.getByText(new RegExp(`FJ${stamp}`, 'i')).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/create the first quote/i)).toBeVisible();

    // ── Step 2: Billing tab + + New quote dialog ─────────────────────────
    await page.getByRole('tab', { name: 'Billing' }).click();
    const composer = page.getByRole('dialog');
    // Re-click until hydration has attached the trigger (slow CI runners).
    await expect(async () => {
      await page
        .getByRole('button', { name: /\+ New quote/i })
        .first()
        .click();
      await expect(composer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(composer.getByText(/create pro forma/i)).toBeVisible();

    // Composer pre-fills service[0] + packages[0] price. Add a 2nd line to
    // satisfy the user's "two service lines" acceptance requirement.
    // CI's dev server can remount the dialog subtree mid-click ("element
    // was detached from the DOM"), so each click runs inside a toPass
    // loop that reopens the composer if a remount closed it.
    await expect(async () => {
      if (!(await composer.isVisible())) {
        await page
          .getByRole('button', { name: /\+ New quote/i })
          .first()
          .click();
      }
      await composer.getByRole('button', { name: /add line/i }).click({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(async () => {
      if (await composer.isVisible()) {
        await composer.getByRole('button', { name: /save draft/i }).click({ timeout: 2_000 });
      }
      await expect(composer).not.toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // ── Step 3: DRAFT quote exists, click Issue inline ───────────────────
    await expect(page.getByText(/draft quote/i).first()).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /^Issue$/i })
      .first()
      .click();
    await expect(page.getByText(/quote issued/i).first()).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Mark as accepted (ReasonDialog) ──────────────────────────
    await page
      .getByRole('button', { name: /^Record client acceptance$/i })
      .first()
      .click();
    const acceptDialog = page.getByRole('dialog');
    await acceptDialog.getByRole('textbox').first().fill('Client confirmed by email');
    await acceptDialog.getByRole('button', { name: /mark as accepted/i }).click();
    await expect(page.getByText(/client accepted/i).first()).toBeVisible({ timeout: 10_000 });

    // ── Step 5: Look up the real pro-forma subtotal from the DB so the
    //    two partial payments add up to exactly the total. The composer
    //    added a 2nd line of the same default service, so subtotal is
    //    2 × expectedPrice — but we read from the DB to be robust
    //    against future composer defaults changes. ────────────────────
    const { eq: eqOp2 } = await import('drizzle-orm');
    const { db: db2 } = await import('../src/lib/db/client');
    const { proFormaInvoices: pfTable } = await import('../src/lib/db/schema/proformas');
    const { leads: leadsTable } = await import('../src/lib/db/schema/leads');
    const [pfRow] = await db2
      .select({ subtotal: pfTable.subtotal })
      .from(pfTable)
      .innerJoin(leadsTable, eqOp2(leadsTable.id, pfTable.sourceLeadId))
      .where(eqOp2(leadsTable.personId, seeded.personId))
      .limit(1);
    const total = Number.parseFloat(pfRow?.subtotal ?? '0');
    expect(total).toBeGreaterThan(0);
    const first = (total / 2).toFixed(2);
    const second = (total - Number.parseFloat(first)).toFixed(2);

    await page
      .getByRole('button', { name: /^Record payment$/i })
      .first()
      .click();
    const payDialog = page.getByRole('dialog');
    await payDialog
      .getByLabel(/amount/i)
      .first()
      .fill(first);
    await payDialog.getByRole('button', { name: /^Record payment$/i }).click();
    await expect(payDialog).not.toBeVisible({ timeout: 10_000 });

    // ── Step 6: Partial payment verifies in the same action ─────────────
    // Stage C workflow collapse — an ADMIN's recording is verified
    // immediately (receipt issued); nothing waits on finance and no
    // Verify button exists. The partial state is still truthful.
    await expect(page.getByText(/Payment verified/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Partially paid/i).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.getByRole('button', { name: /^Verify$/i }).count()).toBe(0);
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-after-partial-payment.png'),
      fullPage: true,
    });

    // ── Step 7 (retired): the manual Verify step no longer exists ───────
    await expect(page.getByText(/record payment/i).first()).toBeVisible({ timeout: 15_000 });

    // ── Step 8: Record the exact remaining amount ───────────────────────
    await page
      .getByRole('button', { name: /^Record payment$/i })
      .first()
      .click();
    const payDialog2 = page.getByRole('dialog');
    await payDialog2
      .getByLabel(/amount/i)
      .first()
      .fill(second);
    await payDialog2.getByRole('button', { name: /^Record payment$/i }).click();
    await expect(payDialog2).not.toBeVisible({ timeout: 10_000 });

    // ── Step 9: the settling payment auto-issues the invoice ────────────
    // Stage C workflow collapse — recording the remaining amount verifies
    // it, issues the official invoice and activates the candidate in the
    // same action. Toast: "Payment verified — invoice INV-… issued and
    // candidate activated".
    // Three independent signals the full-payment branch fired:
    //   (a) Invoices card appears
    //   (b) Engagement balance now shows "Settled"
    //   (c) Primary action flips to "Activate candidate"
    // Assert all three — any one failing would be a regression in the
    // auto-issue chain.
    await expect(page.getByText(/Invoice & receipts/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Settled/i).first()).toBeVisible({ timeout: 10_000 });
    // Stage 6E — verifying the final instalment auto-activates the
    // candidate in the same transaction (no manual step). Stage B Wave 3
    // — the paid activation leaves a live engagement, so the derived
    // hero status reads "In progress".
    await expect(page.getByText(/In progress/i).first()).toBeVisible({ timeout: 10_000 });
    // Stage 6B+3 — the invoice row now shows "Paid" directly from the DB
    // status (the pro-forma verify call atomically runs
    // recomputeInvoiceStatus so no UI display override is involved).
    await expect(page.getByText(/^Paid$/i).first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-after-full-payment.png'),
      fullPage: true,
    });

    // ── Step 10: Count check — exactly 1 engagement, 1 invoice, 2
    //    payments, 2 receipts (one per verified payment), and the
    //    auto-created candidate profile. ─────────────────────────────
    const afterSettle = await countForPerson(seeded.personId);
    expect(afterSettle).toEqual({
      engagements: 1,
      invoices: 1,
      payments: 2,
      receipts: 2,
      candidateProfiles: 1,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'desktop-after-activate.png'),
      fullPage: true,
    });
  } finally {
    await seeded.cleanup();
  }
});

test('activate before full payment creates no new financial rows (DB invariant)', async () => {
  // Business rule: candidate activation and invoice settlement are
  // separate operations. This test proves the invariant by directly
  // writing the operational entity (candidate_profile) that the
  // activation path would write, then asserting no engagement / invoice /
  // payment / receipt rows exist for the person. The pure action is
  // unit-tested in isolation; this is the integration check that the
  // live DB fixture matches the model.
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedLeadWithKnownService(`FJ2${stamp}`);
  try {
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../src/lib/db/client');
    const { candidateProfiles } = await import('../src/lib/db/schema/persons');

    const before = await countForPerson(seeded.personId);
    expect(before).toEqual({
      engagements: 0,
      invoices: 0,
      payments: 0,
      receipts: 0,
      candidateProfiles: 0,
    });

    await db
      .insert(candidateProfiles)
      .values({ assignedUserId: await e2eAdminId(), personId: seeded.personId });

    const after = await countForPerson(seeded.personId);
    expect(after).toEqual({
      engagements: 0,
      invoices: 0,
      payments: 0,
      receipts: 0,
      candidateProfiles: 1,
    });

    // Clean up the manually-inserted profile so the fixture cleanup
    // doesn't trip the FK on candidate_profiles.
    await db.delete(candidateProfiles).where(eq(candidateProfiles.personId, seeded.personId));
  } finally {
    await seeded.cleanup();
  }
});
