import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage B Wave 3 — evidence screenshots at 1440 / 820 / 390. Not a
 * regression suite: seeds one candidate showing every Wave 3 surface
 * (Non-EU eligibility label, In progress chip, Notes card with an entry),
 * waits out the entrance animations, captures, cleans up.
 * Temporary: delete after the Wave 3 evidence pack ships.
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-wave3');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const SETTLE_MS = 1200; // FadeUp entrances finish well under this

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const commerce = await import('../src/lib/db/schema/commerce');
  const services = await import('../src/lib/db/schema/services');
  const activities = await import('../src/lib/db/schema/activities');
  const users = await import('../src/lib/db/schema/users');
  return { db, eq, schemas: { ...persons, ...commerce, ...services, ...activities, ...users } };
}

test('Wave 3 responsive evidence shots', async ({ page }) => {
  test.setTimeout(300_000);
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Aoife',
      lastName: `Demo-${stamp}`,
      email: `wave3-shots-${stamp}@example.test`,
      source: 'DIRECT',
      nationality: 'Indian',
      currentCity: 'Dublin',
      currentCountry: 'Ireland',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('seed failed');
  const personId = person.id;
  const [adminForAssign] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  await m.db.insert(m.schemas.candidateProfiles).values({
    personId,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    workEligibility: 'NON_EU_CITIZEN',
    assignedUserId: adminForAssign?.id ?? null,
  });
  const [catalog] = await m.db
    .select({ id: m.schemas.serviceCatalogItems.id })
    .from(m.schemas.serviceCatalogItems)
    .limit(1);
  if (!catalog) throw new Error('no catalog item');
  await m.db.insert(m.schemas.serviceEngagements).values({
    serviceCatalogItemId: catalog.id,
    payerPersonId: personId,
    agreedAmount: '300.00',
    currencyCode: 'EUR',
    status: 'ACTIVE',
  });
  const [adminUser] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  if (!adminUser) throw new Error('admin user missing');
  await m.db.insert(m.schemas.communicationLogs).values({
    type: 'INTERNAL_NOTE',
    direction: 'INTERNAL',
    staffUserId: adminUser.id,
    personId,
    body: 'Called the candidate — documents promised by Friday. Passport expiry already on file.',
  });

  const widths: Array<[number, number, string]> = [
    [1440, 1100, '1440'],
    [820, 1180, '820'],
    [390, 844, '390'],
  ];
  try {
    for (const [w, h, label] of widths) {
      await page.setViewportSize({ width: w, height: h });

      await page.goto(`/clients/${personId}`);
      await expect(page.getByText('Notes', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `w3-workspace-overview-${label}.png`),
        fullPage: true,
      });

      await page.goto('/candidates?assigned=all');
      await expect(page.getByText(`Aoife Demo-${stamp}`).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(SETTLE_MS);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `w3-candidates-grid-${label}.png`),
        fullPage: false,
      });
    }

    // Desktop-only extras: open the Status filter showing the new chips,
    // and the filtered In-progress view.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/candidates?assigned=all');
    await expect(page.getByText(`Aoife Demo-${stamp}`).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page
      .getByRole('button', { name: /Status/ })
      .first()
      .click();
    await expect(page.getByText('In progress', { exact: true }).first()).toBeVisible({
      timeout: 5_000,
    });
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'w3-status-filter-open-1440.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');

    // Eligibility select scrolled into view inside the Create New Lead
    // dialog, with the option list visible.
    await page.goto('/leads');
    await expect(async () => {
      await page.getByRole('button', { name: 'New lead' }).first().click();
      await expect(page.locator('#cl-elig')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page.locator('#cl-elig').scrollIntoViewIfNeeded();
    await page.locator('#cl-elig').click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'w3-eligibility-select-1440.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await page.goto('/candidates?assigned=all&status=IN_PROGRESS');
    await expect(page.getByText(`Aoife Demo-${stamp}`).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({
      path: path.join(SHOTS_DIR, 'w3-candidates-filtered-1440.png'),
      fullPage: false,
    });
  } finally {
    await m.db
      .delete(m.schemas.communicationLogs)
      .where(m.eq(m.schemas.communicationLogs.personId, personId));
    await m.db
      .delete(m.schemas.serviceEngagements)
      .where(m.eq(m.schemas.serviceEngagements.payerPersonId, personId));
    await m.db
      .delete(m.schemas.candidateProfiles)
      .where(m.eq(m.schemas.candidateProfiles.personId, personId));
    await m.db.delete(m.schemas.persons).where(m.eq(m.schemas.persons.id, personId));
  }
});
