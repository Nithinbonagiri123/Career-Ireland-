import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage B Wave 4 — genuine €0.00 complimentary services.
 *
 * Covers the acceptance list end-to-end: authorized grant with mandatory
 * reason, genuine sequential invoice (no number ever reused), no payment /
 * receipt rows, kind-aware displays, audited void that reconciles the
 * engagement without touching the candidate, duplicate-grant refusal,
 * intake path, and permission-based hiding for plain STAFF.
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-wave4');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray, sql, desc } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const commerce = await import('../src/lib/db/schema/commerce');
  const services = await import('../src/lib/db/schema/services');
  const billing = await import('../src/lib/db/schema/billing');
  const users = await import('../src/lib/db/schema/users');
  return {
    db,
    eq,
    and,
    inArray,
    sql,
    desc,
    schemas: { ...persons, ...commerce, ...services, ...billing, ...users },
  };
}

type M = Awaited<ReturnType<typeof dbModules>>;

async function seedCandidate(m: M, stamp: string) {
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Wave4',
      lastName: `Comp-${stamp}`,
      email: `wave4-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const [adminUser] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  await m.db.insert(m.schemas.candidateProfiles).values({
    personId: person.id,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    assignedUserId: adminUser?.id ?? null,
  });
  return person.id;
}

/** Full billing cascade — mirrors the stage6f cleanup. */
async function cleanupCandidate(m: M, personId: string) {
  const { eq, inArray, schemas, db } = m;
  const engs = await db
    .select({ id: schemas.serviceEngagements.id })
    .from(schemas.serviceEngagements)
    .where(eq(schemas.serviceEngagements.payerPersonId, personId));
  const engIds = engs.map((e) => e.id);
  if (engIds.length > 0) {
    const invs = await db
      .select({ id: schemas.invoices.id })
      .from(schemas.invoices)
      .where(inArray(schemas.invoices.serviceEngagementId, engIds));
    const invIds = invs.map((i) => i.id);
    const pays = await db
      .select({ id: schemas.payments.id })
      .from(schemas.payments)
      .where(inArray(schemas.payments.serviceEngagementId, engIds));
    const payIds = pays.map((p) => p.id);
    if (payIds.length > 0)
      await db.delete(schemas.receipts).where(inArray(schemas.receipts.paymentId, payIds));
    if (invIds.length > 0) {
      await db
        .delete(schemas.invoiceLineItems)
        .where(inArray(schemas.invoiceLineItems.invoiceId, invIds));
      await db.delete(schemas.invoices).where(inArray(schemas.invoices.id, invIds));
    }
    await db.delete(schemas.payments).where(inArray(schemas.payments.serviceEngagementId, engIds));
    await db
      .delete(schemas.serviceEngagements)
      .where(inArray(schemas.serviceEngagements.id, engIds));
  }
  await db
    .delete(schemas.candidateProfiles)
    .where(eq(schemas.candidateProfiles.personId, personId));
  await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
}

async function firstActiveServiceName(m: M): Promise<string> {
  const [item] = await m.db
    .select({ name: m.schemas.serviceCatalogItems.name })
    .from(m.schemas.serviceCatalogItems)
    .where(m.eq(m.schemas.serviceCatalogItems.isActive, true))
    .limit(1);
  if (!item) throw new Error('no active service catalog item');
  return item.name;
}

const INV_RE = /INV-\d{4}-\d{6}/;

function invNumberSeq(n: string): number {
  return Number.parseInt(n.slice(-6), 10);
}

test.describe('Wave 4 — complimentary grant from the workspace', () => {
  test('grant → genuine €0.00 invoice, no money rows, kind-aware UI, duplicate refusal, void reconciliation, number never reused', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedCandidate(m, stamp);
    const serviceName = await firstActiveServiceName(m);
    const reason = `Wave4 e2e hardship waiver ${stamp} — approved by management`;
    try {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto(`/clients/${personId}?tab=services-billing`);

      // ── Grant.
      await expect(async () => {
        await page.getByRole('button', { name: 'Grant complimentary service' }).click();
        await expect(
          page.getByRole('heading', { name: 'Grant complimentary service' }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.locator('#comp-service').selectOption({ label: serviceName });
      await page.locator('#comp-reason').fill(reason);
      await page.screenshot({ path: path.join(SHOTS_DIR, 'w4-grant-dialog-1440.png') });
      await page.getByRole('button', { name: 'Grant & issue €0.00 invoice' }).click();
      const toast = page.getByText(/Complimentary service granted — invoice INV-/);
      await expect(toast).toBeVisible({ timeout: 15_000 });
      const toastText = (await toast.textContent()) ?? '';
      const invoiceNumber = toastText.match(INV_RE)?.[0];
      expect(invoiceNumber, 'toast carries the real invoice number').toBeTruthy();

      // ── DB truth: real invoice, zero money, no payment, no receipt.
      const [inv] = await m.db
        .select()
        .from(m.schemas.invoices)
        .where(m.eq(m.schemas.invoices.number, invoiceNumber as string));
      expect(inv?.settlementKind).toBe('COMPLIMENTARY');
      expect(inv?.status).toBe('PAID');
      expect(Number.parseFloat(inv?.totalAmount ?? '1')).toBe(0);
      expect(inv?.complimentaryReason).toBe(reason);
      expect(inv?.complimentaryGrantedByUserId).toBeTruthy();
      const pays = await m.db
        .select({ id: m.schemas.payments.id })
        .from(m.schemas.payments)
        .where(m.eq(m.schemas.payments.serviceEngagementId, inv?.serviceEngagementId ?? ''));
      expect(pays).toHaveLength(0);
      const rcts = await m.db
        .select({ id: m.schemas.receipts.id })
        .from(m.schemas.receipts)
        .where(m.eq(m.schemas.receipts.invoiceId, inv?.id ?? ''));
      expect(rcts).toHaveLength(0);
      // Engagement is live (ACTIVE) in the chosen currency at €0.00.
      const [eng] = await m.db
        .select({
          status: m.schemas.serviceEngagements.status,
          agreedAmount: m.schemas.serviceEngagements.agreedAmount,
        })
        .from(m.schemas.serviceEngagements)
        .where(m.eq(m.schemas.serviceEngagements.id, inv?.serviceEngagementId ?? ''));
      expect(eng?.status).toBe('ACTIVE');
      expect(Number.parseFloat(eng?.agreedAmount ?? '1')).toBe(0);

      // ── Workspace shows the kind, never "Paid".
      await page.goto(`/clients/${personId}?tab=services-billing`);
      await expect(page.getByText('Complimentary', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('No payment due', { exact: true }).first()).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w4-services-tab-complimentary-1440.png'),
        fullPage: true,
      });

      // ── Invoice detail: Complimentary badge + reason; void available;
      //    the money controls are gone.
      await page.goto(`/candidates/${personId}/invoices/${invoiceNumber}`);
      await expect(page.getByText('Complimentary', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(reason).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Void invoice' })).toBeVisible();
      await expect(page.getByRole('button', { name: /credit note/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Issue refund/i })).toHaveCount(0);
      // Printable: complimentary note + zero total.
      await expect(page.getByText(/COMPLIMENTARY — /).first()).toBeVisible();
      await expect(page.getByText('Total Due', { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w4-invoice-detail-1440.png'),
        fullPage: true,
      });

      // ── Duplicate grant of the same service is refused with guidance.
      await page.goto(`/clients/${personId}?tab=services-billing`);
      await expect(async () => {
        await page.getByRole('button', { name: 'Grant complimentary service' }).click();
        await expect(
          page.getByRole('heading', { name: 'Grant complimentary service' }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.locator('#comp-service').selectOption({ label: serviceName });
      await page.locator('#comp-reason').fill(`${reason} (second attempt)`);
      await page.getByRole('button', { name: 'Grant & issue €0.00 invoice' }).click();
      await expect(page.getByText(/already granted complimentary/)).toBeVisible({
        timeout: 15_000,
      });
      await page.keyboard.press('Escape');

      // ── Void with reason: invoice VOIDED, engagement CANCELLED,
      //    candidate untouched.
      await page.goto(`/candidates/${personId}/invoices/${invoiceNumber}`);
      await expect(async () => {
        await page.getByRole('button', { name: 'Void invoice' }).first().click();
        await expect(
          page.getByPlaceholder('e.g. Duplicate issued in error, wrong currency'),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page
        .getByPlaceholder('e.g. Duplicate issued in error, wrong currency')
        .fill('Wave4 e2e — granted in error');
      await page.getByRole('button', { name: 'Void invoice' }).last().click();
      await expect(page.getByText('Voided', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      const [voided] = await m.db
        .select({ status: m.schemas.invoices.status })
        .from(m.schemas.invoices)
        .where(m.eq(m.schemas.invoices.number, invoiceNumber as string));
      expect(voided?.status).toBe('VOIDED');
      const [engAfter] = await m.db
        .select({ status: m.schemas.serviceEngagements.status })
        .from(m.schemas.serviceEngagements)
        .where(m.eq(m.schemas.serviceEngagements.id, inv?.serviceEngagementId ?? ''));
      expect(engAfter?.status).toBe('CANCELLED');
      const [profile] = await m.db
        .select({ lifecycleStatus: m.schemas.candidateProfiles.lifecycleStatus })
        .from(m.schemas.candidateProfiles)
        .where(m.eq(m.schemas.candidateProfiles.personId, personId));
      expect(profile?.lifecycleStatus).toBe('ACTIVE');

      // ── Re-grant after the void works, and the sequence strictly
      //    advances — the voided number is never reused.
      await page.goto(`/clients/${personId}?tab=services-billing`);
      await expect(async () => {
        await page.getByRole('button', { name: 'Grant complimentary service' }).click();
        await expect(
          page.getByRole('heading', { name: 'Grant complimentary service' }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.locator('#comp-service').selectOption({ label: serviceName });
      await page.locator('#comp-reason').fill(`${reason} (reissued after void)`);
      await page.getByRole('button', { name: 'Grant & issue €0.00 invoice' }).click();
      // Source of truth is the database — the dev server's RSC refresh
      // after several navigations is flaky about settling the toast, but
      // the grant itself commits fast.
      let secondNumber: string | undefined;
      await expect(async () => {
        const rows = await m.db
          .select({ number: m.schemas.invoices.number })
          .from(m.schemas.invoices)
          .where(
            m.and(
              m.eq(m.schemas.invoices.payerPersonId, personId),
              m.eq(m.schemas.invoices.settlementKind, 'COMPLIMENTARY'),
              m.eq(m.schemas.invoices.status, 'PAID'),
            ),
          );
        expect(rows).toHaveLength(1);
        secondNumber = rows[0]?.number;
      }).toPass({ timeout: 20_000 });
      expect(secondNumber).toBeTruthy();
      expect(secondNumber).not.toBe(invoiceNumber);
      expect(invNumberSeq(secondNumber as string)).toBeGreaterThan(
        invNumberSeq(invoiceNumber as string),
      );
    } finally {
      await cleanupCandidate(m, personId);
    }
  });
});

test.describe('Wave 4 — complimentary intake (Screen 09)', () => {
  test('intake with complimentary mode creates the candidate + €0.00 invoice and preserves derived status', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    let personId: string | null = null;
    try {
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto('/candidates/new');
      await expect(page.getByLabel(/First name/)).toBeVisible({ timeout: 30_000 });
      await page.getByLabel(/First name/).fill('Wave4Intake');
      await page.getByLabel(/Last name/).fill(`Comp-${stamp}`);

      await page.getByText('Complimentary service (€0.00 — no payment)').click();
      await page.locator('#comp-reason').fill(`Intake complimentary e2e ${stamp} — pilot cohort`);
      await page.screenshot({ path: path.join(SHOTS_DIR, 'w4-intake-complimentary-1440.png') });
      await page.getByRole('button', { name: 'Grant complimentary & create candidate' }).click();
      await expect(page.getByText(/complimentary invoice INV-/)).toBeVisible({ timeout: 30_000 });

      // Lands on the workspace; Wave 3 derived status shows the live
      // engagement as In progress. The form goes to /candidates/<id>, which
      // redirects to the client workspace — wait for that FINAL URL rather
      // than racing the intermediate one.
      await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+\?just_created=1/, {
        timeout: 20_000,
      });
      personId = page.url().match(/clients\/([0-9a-f-]+)/)?.[1] ?? null;
      expect(personId).toBeTruthy();
      await page.goto(`/clients/${personId}`);
      await expect(page.locator('[title^="Primary onboarding status"]')).toHaveText(/In progress/, {
        timeout: 20_000,
      });

      // DB: no payment, no receipt, audited grant.
      const engs = await m.db
        .select({ id: m.schemas.serviceEngagements.id })
        .from(m.schemas.serviceEngagements)
        .where(m.eq(m.schemas.serviceEngagements.payerPersonId, personId as string));
      expect(engs).toHaveLength(1);
      const pays = await m.db
        .select({ id: m.schemas.payments.id })
        .from(m.schemas.payments)
        .where(m.eq(m.schemas.payments.serviceEngagementId, engs[0]?.id ?? ''));
      expect(pays).toHaveLength(0);
      const audit = await m.db.execute<{ n: string }>(m.sql`
        SELECT COUNT(*)::text AS n FROM audit_events
        WHERE action = 'COMPLIMENTARY_GRANTED'
          AND (context ->> 'personId') = ${personId}
      `);
      expect(Number((audit as Array<{ n: string }>)[0]?.n ?? '0')).toBe(1);
    } finally {
      if (personId) await cleanupCandidate(m, personId);
    }
  });
});

test.describe('Wave 4 — permissions and prohibited actions', () => {
  test('plain STAFF sees no grant affordances; complimentary engagements are not payment targets', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedCandidate(m, `perm-${stamp}`);
    // A second candidate with an ordinary, unpaid engagement, so the
    // /payments dialog has a real payment target of its own. Without it the
    // test depended on other spec files having left payable engagements in
    // the database (on a fresh CI shard the button is correctly disabled).
    const payablePersonId = await seedCandidate(m, `pay-${stamp}`);
    const serviceName = await firstActiveServiceName(m);
    const [svc] = await m.db
      .select({ id: m.schemas.serviceCatalogItems.id })
      .from(m.schemas.serviceCatalogItems)
      .where(m.eq(m.schemas.serviceCatalogItems.name, serviceName))
      .limit(1);
    if (!svc) throw new Error('service lookup failed');
    await m.db.insert(m.schemas.serviceEngagements).values({
      serviceCatalogItemId: svc.id,
      payerPersonId: payablePersonId,
      beneficiaryPersonId: payablePersonId,
      agreedAmount: '150.00',
      currencyCode: 'EUR',
      status: 'PENDING_PAYMENT',
    });
    const reason = `Wave4 perm e2e ${stamp} — goodwill gesture`;
    try {
      // Admin grants first (so a complimentary engagement exists).
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto(`/clients/${personId}?tab=services-billing`);
      await expect(async () => {
        await page.getByRole('button', { name: 'Grant complimentary service' }).click();
        await expect(
          page.getByRole('heading', { name: 'Grant complimentary service' }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.locator('#comp-service').selectOption({ label: serviceName });
      await page.locator('#comp-reason').fill(reason);
      await page.getByRole('button', { name: 'Grant & issue €0.00 invoice' }).click();
      await expect(page.getByText(/Complimentary service granted/)).toBeVisible({
        timeout: 15_000,
      });

      // The /payments record dialog must not offer the complimentary
      // engagement (admin view — richest option list).
      await page.goto('/payments');
      const recordBtn = page.getByRole('button', { name: /Record payment/i }).first();
      await expect(recordBtn).toBeVisible({ timeout: 20_000 });
      await recordBtn.click();
      const engagementSelect = page.locator('#p-engagement');
      await expect(engagementSelect).toBeVisible({ timeout: 10_000 });
      const optionText = (await engagementSelect.textContent()) ?? '';
      // The ordinary engagement is offered; the complimentary one is not.
      expect(optionText).toContain(`Wave4 Comp-pay-${stamp}`);
      expect(optionText).not.toContain(`Wave4 Comp-perm-${stamp}`);
      await page.keyboard.press('Escape');

      // STAFF (no complimentary grant): no button on the workspace, no
      // checkbox on intake.
      const staffContext = await browser.newContext({
        storageState: 'playwright/.auth/staff.json',
        viewport: { width: 1440, height: 1100 },
      });
      const staffPage = await staffContext.newPage();
      await staffPage.goto(`/clients/${personId}?tab=services-billing`);
      await expect(
        staffPage.getByText('Create new service for this candidate').first(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        staffPage.getByRole('button', { name: 'Grant complimentary service' }),
      ).toHaveCount(0);
      // STAFF still sees the complimentary chip (transparency, not secrecy).
      await expect(staffPage.getByText('Complimentary', { exact: true }).first()).toBeVisible();
      await staffPage.goto('/candidates/new');
      await expect(staffPage.getByLabel(/First name/)).toBeVisible({ timeout: 30_000 });
      await expect(staffPage.getByText('Complimentary service (€0.00 — no payment)')).toHaveCount(
        0,
      );
      // Clean the draft the staff visit just created.
      const draftUrl = staffPage.url();
      const draftId = draftUrl.match(/draft=([0-9a-f-]+)/)?.[1];
      await staffContext.close();
      if (draftId) {
        await m.db.execute(
          m.sql`DELETE FROM persons WHERE id = ${draftId}::uuid AND is_draft = true`,
        );
      }
    } finally {
      await cleanupCandidate(m, personId);
      await cleanupCandidate(m, payablePersonId);
    }
  });
});
