import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage B Wave 4 — evidence screenshots at 1440 / 820 / 390. Not a
 * regression suite: grants one complimentary service through the real UI,
 * waits out entrance animations, captures every Wave 4 surface, cleans up.
 * Temporary: delete after the Wave 4 evidence pack ships.
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-wave4');
fs.mkdirSync(SHOTS_DIR, { recursive: true });
const SETTLE_MS = 1200;

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const commerce = await import('../src/lib/db/schema/commerce');
  const services = await import('../src/lib/db/schema/services');
  const billing = await import('../src/lib/db/schema/billing');
  const users = await import('../src/lib/db/schema/users');
  return {
    db,
    eq,
    inArray,
    schemas: { ...persons, ...commerce, ...services, ...billing, ...users },
  };
}

test('Wave 4 responsive evidence shots', async ({ page }) => {
  test.setTimeout(300_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Saoirse',
      lastName: `Comp-${stamp}`,
      email: `wave4-shots-${stamp}@example.test`,
      source: 'DIRECT',
      nationality: 'South African',
      currentCity: 'Cork',
      currentCountry: 'Ireland',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('seed failed');
  const personId = person.id;
  const [adminUser] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  await m.db.insert(m.schemas.candidateProfiles).values({
    personId,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    assignedUserId: adminUser?.id ?? null,
  });
  const [service] = await m.db
    .select({ name: m.schemas.serviceCatalogItems.name })
    .from(m.schemas.serviceCatalogItems)
    .where(m.eq(m.schemas.serviceCatalogItems.isActive, true))
    .limit(1);
  if (!service) throw new Error('no active service');

  try {
    // Grant through the real UI once.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(async () => {
      await page.getByRole('button', { name: 'Grant complimentary service' }).click();
      await expect(page.getByRole('heading', { name: 'Grant complimentary service' })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 20_000 });
    await page.locator('#comp-service').selectOption({ label: service.name });
    await page
      .locator('#comp-reason')
      .fill('Hardship waiver approved by management — pilot cohort, see email of 20 Oct');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'w4-grant-dialog-1440.png') });
    await page.getByRole('button', { name: 'Grant & issue €0.00 invoice' }).click();
    await expect(page.getByText(/Complimentary service granted — invoice INV-/)).toBeVisible({
      timeout: 15_000,
    });
    const [inv] = await m.db
      .select({ number: m.schemas.invoices.number })
      .from(m.schemas.invoices)
      .where(m.eq(m.schemas.invoices.payerPersonId, personId));
    if (!inv) throw new Error('invoice missing after grant');

    for (const [w, h, label] of [
      [1440, 1100, '1440'],
      [820, 1180, '820'],
      [390, 844, '390'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/clients/${personId}?tab=services-billing`);
      await expect(page.getByText('No payment due', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `w4-services-tab-${label}.png`),
        fullPage: false,
      });

      await page.goto(`/candidates/${personId}/invoices/${inv.number}`);
      await expect(page.getByText('Complimentary', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `w4-invoice-detail-${label}.png`),
        fullPage: w === 1440,
      });
    }

    // Intake with complimentary mode on (desktop + phone).
    for (const [w, h, label] of [
      [1440, 1100, '1440'],
      [390, 844, '390'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/candidates/new');
      await expect(page.getByLabel(/First name/)).toBeVisible({ timeout: 30_000 });
      await page.getByLabel(/First name/).fill('Aisling');
      await page.getByLabel(/Last name/).fill('Demo');
      await page.getByText('Complimentary service (€0.00 — no payment)').click();
      await page
        .locator('#comp-reason')
        .fill('Pilot cohort — complimentary onboarding approved by management');
      await page.locator('#comp-reason').scrollIntoViewIfNeeded();
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `w4-intake-complimentary-${label}.png`),
        fullPage: false,
      });
      // Discard the draft each visit created.
      const draftId = page.url().match(/draft=([0-9a-f-]+)/)?.[1];
      if (draftId) {
        const { sql } = await import('drizzle-orm');
        await m.db.execute(
          sql`DELETE FROM persons WHERE id = ${draftId}::uuid AND is_draft = true`,
        );
      }
    }

    // Admin settings — the editable complimentary note.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/admin/settings');
    await expect(page.getByLabel('Complimentary invoice note')).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Complimentary invoice note').scrollIntoViewIfNeeded();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'w4-settings-note-1440.png'),
      fullPage: false,
    });
  } finally {
    const engs = await m.db
      .select({ id: m.schemas.serviceEngagements.id })
      .from(m.schemas.serviceEngagements)
      .where(m.eq(m.schemas.serviceEngagements.payerPersonId, personId));
    const engIds = engs.map((e) => e.id);
    if (engIds.length > 0) {
      const invs = await m.db
        .select({ id: m.schemas.invoices.id })
        .from(m.schemas.invoices)
        .where(m.inArray(m.schemas.invoices.serviceEngagementId, engIds));
      const invIds = invs.map((i) => i.id);
      if (invIds.length > 0) {
        await m.db
          .delete(m.schemas.invoiceLineItems)
          .where(m.inArray(m.schemas.invoiceLineItems.invoiceId, invIds));
        await m.db.delete(m.schemas.invoices).where(m.inArray(m.schemas.invoices.id, invIds));
      }
      await m.db
        .delete(m.schemas.serviceEngagements)
        .where(m.inArray(m.schemas.serviceEngagements.id, engIds));
    }
    await m.db
      .delete(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    await m.db.delete(m.schemas.persons).where(m.eq(m.schemas.persons.id, personId));
  }
});
