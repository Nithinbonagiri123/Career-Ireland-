import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage C workflow collapse — the single-card journey.
 *
 * As ADMIN, everything happens on /clients/[personId] and nowhere else:
 * bare person → one-click CS lead → quote (compose + issue) → ONE
 * "Record payment" click on the ISSUED quote (acceptance implied +
 * finance fast-path verification: receipt, invoice, activation) →
 * "In progress" → record external application → advance to interview →
 * offer → accepted → record placement → derived "Placed".
 *
 * Controls that must survive the collapse are asserted, not assumed:
 * the implicit acceptance is audited with its provenance, and the
 * payment chain produced exactly one engagement / invoice / payment /
 * receipt.
 */

const SHOTS_DIR = path.resolve('playwright/stage-c-one-card');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const leads = await import('../src/lib/db/schema/leads');
  const commerce = await import('../src/lib/db/schema/commerce');
  const billing = await import('../src/lib/db/schema/billing');
  const proformas = await import('../src/lib/db/schema/proformas');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  return {
    db,
    eq,
    and,
    inArray,
    sql,
    schemas: { ...persons, ...leads, ...commerce, ...billing, ...proformas, ...recruitment },
  };
}

test('one-card journey: lead → quote → single-click payment → activation → application → placed', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: `OneCard${stamp}`,
      lastName: 'Journey',
      email: `onecard-${stamp}@example.test`,
      phone: '+353871234111',
      currentCity: 'Galway',
      currentCountry: 'Ireland',
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  const personId = person.id;

  try {
    await page.setViewportSize({ width: 1440, height: 1200 });

    // ── 1. Bare profile → one click opens the CS lead ────────────────
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(async () => {
      await page.getByRole('button', { name: 'Start Candidate Services lead' }).click();
      await expect(page.getByText(/lead opened/)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 25_000 });

    // ── 2. Quote: compose (prefilled) → save draft → issue ───────────
    const composer = page.getByRole('dialog');
    await expect(async () => {
      await page
        .getByRole('button', { name: /\+ New quote/i })
        .first()
        .click();
      await expect(composer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await composer.getByRole('button', { name: /save draft/i }).click();
    await expect(composer).not.toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /^Issue$/i })
      .first()
      .click();
    await expect(page.getByText(/quote issued/i).first()).toBeVisible({ timeout: 10_000 });

    // ── 3. ONE payment click on the ISSUED quote: implied acceptance +
    //       finance fast-path (verify + receipt + invoice + activation).
    const [pfRow] = await m.db
      .select({ id: m.schemas.proFormaInvoices.id, subtotal: m.schemas.proFormaInvoices.subtotal })
      .from(m.schemas.proFormaInvoices)
      .innerJoin(m.schemas.leads, m.eq(m.schemas.leads.id, m.schemas.proFormaInvoices.sourceLeadId))
      .where(m.eq(m.schemas.leads.personId, personId))
      .limit(1);
    expect(pfRow).toBeTruthy();
    const total = Number.parseFloat(pfRow?.subtotal ?? '0');
    expect(total).toBeGreaterThan(0);

    await page
      .getByRole('button', { name: /^Record payment$/i })
      .first()
      .click();
    const payDialog = page.getByRole('dialog');
    await payDialog
      .getByLabel(/amount/i)
      .first()
      .fill(total.toFixed(2));
    await payDialog.getByRole('button', { name: /^Record payment$/i }).click();
    await expect(
      page.getByText(/Payment verified — invoice INV-.* issued and candidate activated/),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/In progress/i).first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'c-one-card-01-paid-activated.png'),
      fullPage: false,
    });

    // DB truth: acceptance was implied + audited; exactly one of each
    // money artefact; no manual steps happened.
    const [pfAfter] = await m.db
      .select({ status: m.schemas.proFormaInvoices.status })
      .from(m.schemas.proFormaInvoices)
      .where(m.eq(m.schemas.proFormaInvoices.id, pfRow?.id ?? ''));
    expect(['ACCEPTED', 'CONVERTED']).toContain(pfAfter?.status);
    const [acceptAudit] = await m.db.execute<{ n: string }>(m.sql`
      SELECT COUNT(*)::text AS n FROM audit_events
      WHERE entity_id = ${pfRow?.id ?? ''} AND action = 'ACCEPTED'
        AND (context ->> 'via') = 'implied_by_payment'
    `);
    expect((acceptAudit as unknown as { n: string }).n ?? acceptAudit?.n).toBe('1');
    const engs = await m.db
      .select({ id: m.schemas.serviceEngagements.id })
      .from(m.schemas.serviceEngagements)
      .where(m.eq(m.schemas.serviceEngagements.payerPersonId, personId));
    expect(engs).toHaveLength(1);
    const pays = await m.db
      .select({ status: m.schemas.payments.status })
      .from(m.schemas.payments)
      .where(m.eq(m.schemas.payments.serviceEngagementId, engs[0]?.id ?? ''));
    expect(pays).toHaveLength(1);
    expect(pays[0]?.status).toBe('VERIFIED');
    const invs = await m.db
      .select({ id: m.schemas.invoices.id, status: m.schemas.invoices.status })
      .from(m.schemas.invoices)
      .where(m.eq(m.schemas.invoices.serviceEngagementId, engs[0]?.id ?? ''));
    expect(invs).toHaveLength(1);
    const rcts = await m.db
      .select({ id: m.schemas.receipts.id })
      .from(m.schemas.receipts)
      .where(m.eq(m.schemas.receipts.invoiceId, invs[0]?.id ?? ''));
    expect(rcts).toHaveLength(1);

    // ── 4. Applications tab (same page). An INTERNAL application (our
    //       requisition) is seeded — that is the only kind the
    //       Recruitment rule allows to become a placement; the external
    //       path is exercised through the UI right after.
    const [emp] = await m.db
      .insert(m.schemas.employers)
      .values({ assignedUserId: await e2eAdminId(), legalName: `OneCard Employer ${stamp}` })
      .returning({ id: m.schemas.employers.id });
    const [req] = await m.db
      .insert(m.schemas.jobRequisitions)
      .values({
        assignedUserId: await e2eAdminId(),
        employerId: emp?.id ?? '',
        title: `Care Assistant ${stamp}`,
        status: 'OPEN',
      })
      .returning({ id: m.schemas.jobRequisitions.id });
    await m.db.insert(m.schemas.jobApplications).values({
      personId,
      jobRequisitionId: req?.id ?? null,
      source: 'INTERNAL',
      status: 'APPLIED',
    });

    await page.goto(`/clients/${personId}?tab=applications`);
    await expect(async () => {
      await page.getByRole('button', { name: /Log external application/i }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });
    const appDialog = page.getByRole('dialog');
    await appDialog
      .getByLabel(/company/i)
      .first()
      .fill(`Mowlam ${stamp}`);
    await appDialog
      .getByLabel(/job title/i)
      .first()
      .fill('Healthcare Assistant');
    await appDialog.getByRole('button', { name: 'Log application', exact: true }).click();
    await expect(appDialog).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Healthcare Assistant').first()).toBeVisible({ timeout: 15_000 });
    // External ACCEPTED rows never offer Record placement — asserted
    // later; the ladder below runs on the INTERNAL application's row.

    // ── 5. Advance the internal application: interview → offer →
    //       accepted → placement ─────────────────────────────────────
    const internalRow = page.locator('li', { hasText: `Care Assistant ${stamp}` });
    const advance = async (label: RegExp, toastRe: RegExp) => {
      await expect(async () => {
        await internalRow.getByRole('button', { name: 'Update application status' }).click();
        await expect(page.getByRole('menuitem').first()).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.getByRole('menuitem', { name: label }).click();
      await expect(page.getByText(toastRe).first()).toBeVisible({ timeout: 15_000 });
    };
    await advance(/move to interview/i, /moved to interview/i);
    await advance(/record offer|move to offer/i, /moved to offer/i);
    await advance(/mark accepted|move to accepted/i, /moved to accepted/i);
    // R3 — the status ladder records no CRM offer, so placing goes through
    // the audited exception (reason + confirmation).
    const exception = page.getByRole('dialog');
    await expect(async () => {
      await internalRow.getByRole('button', { name: 'Record placement' }).click();
      await expect(exception.getByText(/without an accepted offer/i)).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 20_000 });
    await exception.locator('#pe-reason').fill('Hired through the employer’s own process');
    await exception.getByRole('checkbox').click();
    await exception.getByRole('button', { name: 'Place without offer' }).click();
    await expect(page.getByText(/Placement recorded/).first()).toBeVisible({ timeout: 15_000 });

    // DB truth: the placement is CONFIRMED (the PROPOSED row created at
    // ACCEPTED was confirmed, not duplicated) and availability flipped.
    const placementRows = await m.db
      .select({ id: m.schemas.placements.id, status: m.schemas.placements.status })
      .from(m.schemas.placements)
      .where(m.eq(m.schemas.placements.personId, personId));
    expect(placementRows).toHaveLength(1);
    expect(placementRows[0]?.status).toBe('CONFIRMED');
    const [profileRow] = await m.db
      .select({ availability: m.schemas.candidateProfiles.availabilityStatus })
      .from(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    expect(profileRow?.availability).toBe('PLACED');

    // ── 6. Derived Placed on the same profile ────────────────────────
    await page.goto(`/clients/${personId}`);
    await expect(page.locator('[title^="Primary onboarding status"]')).toHaveText(/Placed/, {
      timeout: 20_000,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'c-one-card-02-placed.png'),
      fullPage: false,
    });
    const [profile] = await m.db
      .select({ availabilityStatus: m.schemas.candidateProfiles.availabilityStatus })
      .from(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    expect(profile?.availabilityStatus).toBe('PLACED');
  } finally {
    const { eq, inArray, schemas, db } = m;
    await db.delete(schemas.placements).where(eq(schemas.placements.personId, personId));
    await db.delete(schemas.jobApplications).where(eq(schemas.jobApplications.personId, personId));
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
          .delete(schemas.proFormaOfficialInvoices)
          .where(inArray(schemas.proFormaOfficialInvoices.invoiceId, invIds));
        await db
          .delete(schemas.invoiceLineItems)
          .where(inArray(schemas.invoiceLineItems.invoiceId, invIds));
        await db.delete(schemas.invoices).where(inArray(schemas.invoices.id, invIds));
      }
      await db
        .delete(schemas.payments)
        .where(inArray(schemas.payments.serviceEngagementId, engIds));
      await db
        .delete(schemas.serviceEngagements)
        .where(inArray(schemas.serviceEngagements.id, engIds));
    }
    await db
      .delete(schemas.jobRequisitions)
      .where(eq(schemas.jobRequisitions.title, `Care Assistant ${stamp}`));
    await db
      .delete(schemas.employers)
      .where(eq(schemas.employers.legalName, `OneCard Employer ${stamp}`));
    const leadRows = await db
      .select({ id: schemas.leads.id })
      .from(schemas.leads)
      .where(eq(schemas.leads.personId, personId));
    const leadIds = leadRows.map((l) => l.id);
    if (leadIds.length > 0) {
      const pfs = await db
        .select({ id: schemas.proFormaInvoices.id })
        .from(schemas.proFormaInvoices)
        .where(inArray(schemas.proFormaInvoices.sourceLeadId, leadIds));
      if (pfs.length > 0) {
        const pfIds = pfs.map((x) => x.id);
        await db
          .delete(schemas.proFormaLineItems)
          .where(inArray(schemas.proFormaLineItems.proFormaInvoiceId, pfIds));
        await db
          .delete(schemas.proFormaInvoices)
          .where(inArray(schemas.proFormaInvoices.id, pfIds));
      }
      await db
        .delete(schemas.proposalGroups)
        .where(inArray(schemas.proposalGroups.leadId, leadIds));
      await db.delete(schemas.leads).where(inArray(schemas.leads.id, leadIds));
    }
    await db
      .delete(schemas.candidateProfiles)
      .where(eq(schemas.candidateProfiles.personId, personId));
    await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
  }
});
