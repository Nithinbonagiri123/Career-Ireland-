import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage B Wave 3 — eligibility labels, derived CS progress statuses,
 * candidate notes.
 *
 * 3.1 "Non-EU Citizen" joins Main Eligibility and every eligibility value
 *     renders as a human-readable label (existing values preserved).
 * 3.2 Active candidate / In progress / Placed / Completed derived from
 *     real service engagements + Recruitment's availabilityStatus; the
 *     transitions never write availabilityStatus from Candidate Services.
 * 3.3 Notes on the candidate Overview — communication-log backed, author +
 *     absolute date & time, edit/archive gated to author-or-admin.
 */

const SHOTS_DIR = path.resolve('playwright/stage-b-wave3');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, and, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const commerce = await import('../src/lib/db/schema/commerce');
  const services = await import('../src/lib/db/schema/services');
  const activities = await import('../src/lib/db/schema/activities');
  const users = await import('../src/lib/db/schema/users');
  return {
    db,
    eq,
    and,
    inArray,
    sql,
    schemas: { ...persons, ...commerce, ...services, ...activities, ...users },
  };
}

type M = Awaited<ReturnType<typeof dbModules>>;

async function seedCandidate(
  m: M,
  stamp: string,
  profile?: Partial<{ workEligibility: string; availabilityStatus: string }>,
) {
  const [person] = await m.db
    .insert(m.schemas.persons)
    .values({
      firstName: 'Wave3',
      lastName: `Progress-${stamp}`,
      email: `wave3-${stamp}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: m.schemas.persons.id });
  if (!person) throw new Error('person seed failed');
  // Assigned to the e2e admin: the card pill's "Unassigned" alert (which
  // deliberately outranks everything for unassigned available candidates)
  // would otherwise mask the Wave 3 progress labels under test.
  const [adminUser] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  await m.db.insert(m.schemas.candidateProfiles).values({
    personId: person.id,
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: (profile?.availabilityStatus ?? 'AVAILABLE') as 'AVAILABLE',
    workEligibility: profile?.workEligibility ?? null,
    assignedUserId: adminUser?.id ?? null,
  });
  return person.id;
}

async function cleanupCandidate(m: M, personId: string) {
  const { eq, schemas, db } = m;
  await db
    .delete(schemas.communicationLogs)
    .where(eq(schemas.communicationLogs.personId, personId));
  await db
    .delete(schemas.serviceEngagements)
    .where(eq(schemas.serviceEngagements.payerPersonId, personId));
  await db
    .delete(schemas.candidateProfiles)
    .where(eq(schemas.candidateProfiles.personId, personId));
  await db.delete(schemas.persons).where(eq(schemas.persons.id, personId));
}

async function firstCatalogItemId(m: M): Promise<string> {
  const [item] = await m.db
    .select({ id: m.schemas.serviceCatalogItems.id })
    .from(m.schemas.serviceCatalogItems)
    .limit(1);
  if (!item) throw new Error('no service catalog item seeded — run the catalog seed first');
  return item.id;
}

/** The hero's primary-status chip on the client workspace. */
function heroStatusChip(page: import('@playwright/test').Page) {
  return page.locator('[title^="Primary onboarding status"]');
}

test.describe('Wave 3.1 — Non-EU Citizen eligibility + readable labels', () => {
  test('create-lead dialog offers Non-EU citizen; workspace shows labels for new and existing values', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const nonEuId = await seedCandidate(m, `neu-${stamp}`, { workEligibility: 'NON_EU_CITIZEN' });
    const stampFourId = await seedCandidate(m, `s4-${stamp}`, {
      workEligibility: 'STAMP_4_HOLDER',
    });
    try {
      // Dialog options — Candidate Services is the default target, so the
      // Main eligibility select renders immediately.
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.goto('/leads');
      await expect(async () => {
        await page.getByRole('button', { name: 'New lead' }).first().click();
        await expect(page.locator('#cl-elig')).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      const optionLabels = await page.locator('#cl-elig option').allTextContents();
      expect(optionLabels).toContain('Non-EU citizen');
      expect(optionLabels).toContain('Stamp 4 holder');
      expect(optionLabels).toContain('EU / EEA / Swiss citizen');
      // No raw enum values leak into the dropdown.
      expect(optionLabels.join(' ')).not.toMatch(/NON_EU_CITIZEN|STAMP_4_HOLDER/);
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w3-eligibility-dialog.png'),
        fullPage: false,
      });
      await page.keyboard.press('Escape');

      // Workspace renders the stored value as its label — new value…
      await page.goto(`/clients/${nonEuId}`);
      await expect(page.getByText('Work eligibility').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Non-EU citizen').first()).toBeVisible();
      // …and a pre-existing value is preserved and readable, not mangled.
      await page.goto(`/clients/${stampFourId}`);
      await expect(page.getByText('Work eligibility').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Stamp 4 holder').first()).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w3-eligibility-workspace.png'),
        fullPage: false,
      });
    } finally {
      await cleanupCandidate(m, nonEuId);
      await cleanupCandidate(m, stampFourId);
    }
  });
});

test.describe('Wave 3.2 — derived Candidate Services progress statuses', () => {
  test('Active candidate → In progress → Completed → Placed, from real records only', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedCandidate(m, stamp);
    try {
      await page.setViewportSize({ width: 1440, height: 1100 });

      // 1. Activated, no engagements — plain Active candidate.
      await page.goto(`/clients/${personId}`);
      await expect(heroStatusChip(page)).toHaveText(/Active candidate/, { timeout: 20_000 });

      // 2. A live engagement → In progress (workspace + candidates page).
      const catalogId = await firstCatalogItemId(m);
      const [eng] = await m.db
        .insert(m.schemas.serviceEngagements)
        .values({
          serviceCatalogItemId: catalogId,
          payerPersonId: personId,
          agreedAmount: '300.00',
          currencyCode: 'EUR',
          status: 'ACTIVE',
        })
        .returning({ id: m.schemas.serviceEngagements.id });
      if (!eng) throw new Error('engagement seed failed');

      await page.goto(`/clients/${personId}`);
      await expect(heroStatusChip(page)).toHaveText(/In progress/, { timeout: 20_000 });
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w3-status-in-progress.png'),
        fullPage: false,
      });

      // The candidate's own card (article carries an aria-label) must show
      // the derived pill — a loose locator here once matched another
      // card's pill, so keep this scoped.
      const card = page.locator(`article[aria-label="Candidate Wave3 Progress-${stamp}"]`);
      await page.goto(`/candidates?assigned=all&status=IN_PROGRESS`);
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card.getByText('In progress', { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w3-candidates-filter-in-progress.png'),
        fullPage: false,
      });
      // The Completed filter excludes a live engagement.
      await page.goto(`/candidates?assigned=all&status=COMPLETED`);
      await expect(page.getByText(`Wave3 Progress-${stamp}`)).toHaveCount(0, { timeout: 20_000 });

      // 3. Engagement finishes → Completed.
      await m.db
        .update(m.schemas.serviceEngagements)
        .set({ status: 'COMPLETED' })
        .where(m.eq(m.schemas.serviceEngagements.id, eng.id));
      await page.goto(`/clients/${personId}`);
      await expect(heroStatusChip(page)).toHaveText(/Completed/, { timeout: 20_000 });
      await page.goto(`/candidates?assigned=all&status=COMPLETED`);
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(card.getByText('Completed', { exact: true })).toBeVisible();

      // Candidate Services never wrote Recruitment's availabilityStatus —
      // the engagement transitions above left it exactly as seeded.
      const [profile] = await m.db
        .select({ availabilityStatus: m.schemas.candidateProfiles.availabilityStatus })
        .from(m.schemas.candidateProfiles)
        .where(m.eq(m.schemas.candidateProfiles.personId, personId));
      expect(profile?.availabilityStatus).toBe('AVAILABLE');

      // 4. A real Recruitment placement (availabilityStatus = PLACED,
      //    written here the way flipAvailabilityToPlaced does) wins over
      //    everything.
      await m.db
        .update(m.schemas.candidateProfiles)
        .set({ availabilityStatus: 'PLACED' })
        .where(m.eq(m.schemas.candidateProfiles.personId, personId));
      await page.goto(`/clients/${personId}`);
      await expect(heroStatusChip(page)).toHaveText(/Placed/, { timeout: 20_000 });
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w3-status-placed.png'),
        fullPage: false,
      });
    } finally {
      await cleanupCandidate(m, personId);
    }
  });

  test('an UNASSIGNED candidate is still discoverable under their derived progress filter', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedCandidate(m, `un-${stamp}`);
    try {
      // Strip the assignment the seed helper adds — this candidate is
      // deliberately unassigned.
      await m.db
        .update(m.schemas.candidateProfiles)
        .set({ assignedUserId: null })
        .where(m.eq(m.schemas.candidateProfiles.personId, personId));
      const catalogId = await firstCatalogItemId(m);
      await m.db.insert(m.schemas.serviceEngagements).values({
        serviceCatalogItemId: catalogId,
        payerPersonId: personId,
        agreedAmount: '150.00',
        currencyCode: 'EUR',
        status: 'ACTIVE',
      });

      await page.setViewportSize({ width: 1440, height: 1100 });
      // The In-progress filter must surface them even though the card
      // pill shows the higher-priority "Unassigned" operational alert.
      const card = page.locator(`article[aria-label="Candidate Wave3 Progress-un-${stamp}"]`);
      await page.goto('/candidates?assigned=all&status=IN_PROGRESS');
      await expect(card).toBeVisible({ timeout: 20_000 });
      // .first() — the card shows "Unassigned" twice (status pill +
      // owner chip); the pill is the one under test.
      await expect(card.getByText('Unassigned', { exact: true }).first()).toBeVisible();
      // And the Unassigned scope still finds them too — neither view
      // loses the candidate.
      await page.goto('/candidates?assigned=unassigned');
      await expect(card).toBeVisible({ timeout: 20_000 });
      // A filter they do NOT match excludes them.
      await page.goto('/candidates?assigned=all&status=COMPLETED');
      await expect(card).toHaveCount(0, { timeout: 20_000 });
    } finally {
      await cleanupCandidate(m, personId);
    }
  });
});

test.describe('Wave 3.3 — candidate notes (author, timestamps, permissions)', () => {
  test('staff add notes; edit/archive is author-or-admin only; notes stay on the right candidate', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const stamp = Math.random().toString(36).slice(2, 6);
    const m = await dbModules();
    const personId = await seedCandidate(m, `notes-${stamp}`);
    const otherPersonId = await seedCandidate(m, `other-${stamp}`);
    const adminNoteText = `Admin note ${stamp} — follow up on documents`;
    const staffNoteText = `Staff note ${stamp} — called candidate, no answer`;
    try {
      await page.setViewportSize({ width: 1440, height: 1100 });

      // ── Admin adds a note.
      await page.goto(`/clients/${personId}`);
      await expect(page.getByText('Notes', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(async () => {
        await page.getByRole('button', { name: '+ Add note' }).click();
        await expect(page.getByRole('heading', { name: 'Add note' })).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 20_000 });
      await page.getByPlaceholder('Internal note about this candidate…').fill(adminNoteText);
      await page.getByRole('button', { name: 'Save note' }).click();
      await expect(page.getByText(adminNoteText)).toBeVisible({ timeout: 15_000 });
      // Author + absolute date & time ("12 Oct 2026 at 14:03").
      const adminMeta = page
        .locator('p', { hasText: 'E2E Admin' })
        .filter({ hasText: / at \d{2}:\d{2}/ })
        .first();
      await expect(adminMeta).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'w3-notes-admin.png'),
        fullPage: false,
      });

      // ── Admin edits their own note.
      const adminNoteRow = page
        .locator('div')
        .filter({ has: page.getByText(adminNoteText, { exact: true }) })
        .last();
      await adminNoteRow.getByRole('button', { name: 'Note actions' }).click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();
      const editBox = page.locator('textarea').last();
      await editBox.fill(`${adminNoteText} (updated)`);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText(`${adminNoteText} (updated)`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/· edited/).first()).toBeVisible();

      // ── The other candidate's overview never shows this note.
      await page.goto(`/clients/${otherPersonId}`);
      await expect(page.getByText('Notes', { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(adminNoteText, { exact: false })).toHaveCount(0);

      // ── STAFF: sees the admin note read-only, adds + edits their own.
      const staffContext = await browser.newContext({
        storageState: 'playwright/.auth/staff.json',
        viewport: { width: 1440, height: 1100 },
      });
      const staffPage = await staffContext.newPage();
      await staffPage.goto(`/clients/${personId}`);
      await expect(staffPage.getByText(`${adminNoteText} (updated)`)).toBeVisible({
        timeout: 20_000,
      });
      // No action menu on someone else's note for plain STAFF…
      await expect(staffPage.getByRole('button', { name: 'Note actions' })).toHaveCount(0);
      // …but they can add their own.
      await expect(async () => {
        await staffPage.getByRole('button', { name: '+ Add note' }).click();
        await expect(staffPage.getByRole('heading', { name: 'Add note' })).toBeVisible({
          timeout: 2_000,
        });
      }).toPass({ timeout: 20_000 });
      await staffPage.getByPlaceholder('Internal note about this candidate…').fill(staffNoteText);
      await staffPage.getByRole('button', { name: 'Save note' }).click();
      await expect(staffPage.getByText(staffNoteText)).toBeVisible({ timeout: 15_000 });
      // Exactly one actions menu now — on the staff member's own note.
      await expect(staffPage.getByRole('button', { name: 'Note actions' })).toHaveCount(1);
      await staffPage.screenshot({
        path: path.join(SHOTS_DIR, 'w3-notes-staff-view.png'),
        fullPage: false,
      });
      await staffContext.close();

      // ── Server-side enforcement, not just hidden buttons: the DB shows
      //    the staff note's author; admin (moderator) archives it with an
      //    audited reason and the row survives with archivedAt set.
      await page.goto(`/clients/${personId}`);
      await expect(page.getByText(staffNoteText)).toBeVisible({ timeout: 20_000 });
      const staffNoteRow = page
        .locator('div')
        .filter({ has: page.getByText(staffNoteText, { exact: true }) })
        .last();
      await staffNoteRow.getByRole('button', { name: 'Note actions' }).click();
      await page.getByRole('menuitem', { name: 'Archive' }).click();
      await page
        .getByPlaceholder('e.g. Added to the wrong candidate')
        .fill('Wave 3 e2e — moderator archive');
      await page.getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(page.getByText(staffNoteText)).toHaveCount(0, { timeout: 15_000 });

      const rows = await m.db
        .select({
          body: m.schemas.communicationLogs.body,
          archivedAt: m.schemas.communicationLogs.archivedAt,
          type: m.schemas.communicationLogs.type,
        })
        .from(m.schemas.communicationLogs)
        .where(m.eq(m.schemas.communicationLogs.personId, personId));
      const archived = rows.find((r) => r.body === staffNoteText);
      expect(archived?.archivedAt).toBeTruthy();
      expect(archived?.type).toBe('INTERNAL_NOTE');
      // The admin's note is still live.
      expect(rows.some((r) => r.body?.includes('(updated)') && !r.archivedAt)).toBe(true);
    } finally {
      await cleanupCandidate(m, personId);
      await cleanupCandidate(m, otherPersonId);
    }
  });
});
