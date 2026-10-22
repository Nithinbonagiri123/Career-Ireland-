import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage C1 — before/after UI evidence for the payment-state label fix.
 * Seeds the exact reported scenario (Ads: €125 agreed, €0 received,
 * direct engagement, no quote) plus a partially-paid sibling, and
 * captures the Services & Billing tab. Run pre-fix for "before" shots
 * (SHOT_TAG=before) and post-fix for "after" (SHOT_TAG=after).
 * Temporary: delete after C1 acceptance.
 */

const TAG = process.env.SHOT_TAG ?? 'after';
const SHOTS_DIR = path.resolve('playwright/stage-c1');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const commerce = await import('../src/lib/db/schema/commerce');
  const services = await import('../src/lib/db/schema/services');
  const users = await import('../src/lib/db/schema/users');
  return { db, eq, inArray, schemas: { ...persons, ...commerce, ...services, ...users } };
}

test(`C1 payment-state evidence (${TAG})`, async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Niamh',
      lastName: `C1-${stamp}`,
      email: `c1-${stamp}@example.test`,
      source: 'DIRECT',
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
  const [svc] = await m.db
    .select({ id: m.schemas.serviceCatalogItems.id })
    .from(m.schemas.serviceCatalogItems)
    .where(m.eq(m.schemas.serviceCatalogItems.isActive, true))
    .limit(1);
  if (!svc) throw new Error('no catalog item');

  // The reported case: €125 agreed, €0 received.
  const [engZero] = await m.db
    .insert(m.schemas.serviceEngagements)
    .values({
      serviceCatalogItemId: svc.id,
      payerPersonId: personId,
      beneficiaryPersonId: personId,
      agreedAmount: '125.00',
      currencyCode: 'EUR',
      status: 'ACTIVE',
    })
    .returning({ id: m.schemas.serviceEngagements.id });
  // A genuinely part-paid sibling: €200 agreed, €80 verified.
  const [engPart] = await m.db
    .insert(m.schemas.serviceEngagements)
    .values({
      serviceCatalogItemId: svc.id,
      payerPersonId: personId,
      beneficiaryPersonId: personId,
      agreedAmount: '200.00',
      currencyCode: 'EUR',
      status: 'ACTIVE',
    })
    .returning({ id: m.schemas.serviceEngagements.id });
  if (!engZero || !engPart) throw new Error('engagement seed failed');
  await m.db.insert(m.schemas.payments).values({
    serviceEngagementId: engPart.id,
    amount: '80.00',
    currencyCode: 'EUR',
    method: 'BANK_TRANSFER',
    status: 'VERIFIED',
    receivedAt: new Date(),
    verifiedAt: new Date(),
    verifiedByUserId: adminUser?.id ?? null,
  });

  try {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(page.getByText('Service history').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `c1-${TAG}-services-1440.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 1600 });
    await page.goto(`/clients/${personId}?tab=services-billing`);
    await expect(page.getByText('Service history').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(SHOTS_DIR, `c1-${TAG}-services-390.png`),
      fullPage: true,
    });

    if (TAG === 'after') {
      // Post-fix assertions: history and card agree, three states truthful.
      await page.setViewportSize({ width: 1440, height: 1400 });
      await page.goto(`/clients/${personId}?tab=services-billing`);
      const history = page.locator('table');
      await expect(history.getByText('Awaiting payment', { exact: true })).toHaveCount(1, {
        timeout: 20_000,
      });
      await expect(history.getByText('Partially paid', { exact: true })).toHaveCount(1);
      // Zero-received must never read "Partially paid" anywhere.
      const zeroRow = page.locator('tr', { hasText: '€125.00' }).first();
      await expect(zeroRow.getByText('Awaiting payment', { exact: true })).toBeVisible();
    }
  } finally {
    await m.db
      .delete(m.schemas.payments)
      .where(m.inArray(m.schemas.payments.serviceEngagementId, [engZero.id, engPart.id]));
    await m.db
      .delete(m.schemas.serviceEngagements)
      .where(m.inArray(m.schemas.serviceEngagements.id, [engZero.id, engPart.id]));
    await m.db
      .delete(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    await m.db.delete(m.schemas.persons).where(m.eq(m.schemas.persons.id, personId));
  }
});
