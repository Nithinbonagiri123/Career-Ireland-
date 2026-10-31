import { expect, type Page, test } from '@playwright/test';
import { withIsolatedUser } from './helpers/isolated-user';
import { e2eAdminId } from './helpers/owner';

/**
 * P0 placements (W2) — business scenario, admin project.
 *
 * Returning client: a recruiter places Maria from an accepted €34,000 offer
 * starting 1 Dec 2026. /placements then shows €34,000 and 1 Dec 2026 (the
 * offer's terms were copied onto the placement). An admin clicks "Raise
 * fee" on the job's Seats tab and lands on the employer with the invoice
 * dialog already open. Re-adding Maria to the job says she is already on
 * it. A DRAFT job refuses "Add candidate" with the open-job message.
 *
 * Rows are seeded with a unique stamp and removed in `finally`. No invoice
 * is issued.
 */

async function dbModules() {
  // e2eAdminId() loads the local test environment for the DB client.
  const adminId = await e2eAdminId();
  const { eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  const audit = await import('../src/lib/db/schema/audit_events');
  const io = await import('../src/lib/db/schema/interviews_offers');
  return { adminId, db, eq, inArray, s: { ...recruitment, ...personsSchema, ...audit, ...io } };
}

async function expand(page: Page, rowsTestId: string, text: RegExp) {
  const row = page.getByTestId(rowsTestId).locator('li').filter({ hasText: text }).first();
  const isOpen = await row.locator('details').evaluate((d) => (d as HTMLDetailsElement).open);
  if (!isOpen) await row.locator('summary').click();
  return row;
}

test('returning client: place Maria from an accepted offer, raise the fee, re-add, draft job', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = {
    employer: '',
    job: '',
    draftJob: '',
    maria: '',
    app: '',
  };

  const [emp] = await m.db
    .insert(m.s.employers)
    .values({
      assignedUserId: m.adminId,
      legalName: `P0 Place Returning Care ${stamp}`,
      relationshipStatus: 'ACTIVE',
    })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('seed failed');
  ids.employer = emp.id;
  const [job, draft] = await m.db
    .insert(m.s.jobRequisitions)
    .values([
      {
        assignedUserId: m.adminId,
        employerId: emp.id,
        title: `P0 Place Care Assistant ${stamp}`,
        positionsRequired: 2,
        employmentType: 'FULL_TIME' as const,
        status: 'OPEN' as const,
      },
      {
        assignedUserId: m.adminId,
        employerId: emp.id,
        title: `P0 Place Night Carer ${stamp}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME' as const,
        status: 'DRAFT' as const,
      },
    ])
    .returning({ id: m.s.jobRequisitions.id });
  if (!job || !draft) throw new Error('seed failed');
  ids.job = job.id;
  ids.draftJob = draft.id;
  const [maria] = await m.db
    .insert(m.s.persons)
    .values({ firstName: 'Maria', lastName: `Pzero${stamp}`, source: 'DIRECT' })
    .returning({ id: m.s.persons.id });
  if (!maria) throw new Error('seed failed');
  ids.maria = maria.id;
  await m.db
    .insert(m.s.candidateProfiles)
    .values({ personId: maria.id, availabilityStatus: 'AVAILABLE' });
  const [app] = await m.db
    .insert(m.s.jobApplications)
    .values({ personId: maria.id, jobRequisitionId: job.id, source: 'INTERNAL', status: 'OFFER' })
    .returning({ id: m.s.jobApplications.id });
  if (!app) throw new Error('seed failed');
  ids.app = app.id;
  await m.db.insert(m.s.offers).values({
    jobApplicationId: app.id,
    amount: '34000',
    currencyCode: 'EUR',
    period: 'ANNUAL',
    startDate: '2026-12-01',
    status: 'ACCEPTED',
    sentAt: new Date('2026-10-26T10:00:00Z'),
    respondedAt: new Date('2026-10-28T15:30:00Z'),
    createdByUserId: m.adminId,
  });
  const mariaName = new RegExp(`Maria Pzero${stamp}`);

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── 1. Recruiter places Maria from the accepted offer.
    await page.goto(`/requisitions/${ids.job}?tab=interviews`);
    const io = page.getByTestId('interviews-offers');
    await io.getByRole('button', { name: /^Accepted/ }).click();
    const offer = await expand(page, 'offer-rows', mariaName);
    await offer.getByRole('button', { name: 'Place candidate' }).click();
    const placeDialog = page.getByRole('dialog');
    await expect(placeDialog).toContainText('€34,000 annual');
    await expect(placeDialog).toContainText('starting 1 Dec 2026');
    await placeDialog.getByRole('button', { name: 'Place candidate' }).click();
    await expect(page.getByText(new RegExp(`Maria Pzero${stamp} placed`)).first()).toBeVisible({
      timeout: 20_000,
    });

    // ── 2. /placements shows the offer's salary and start date.
    await page.goto(`/placements?q=${encodeURIComponent(`Pzero${stamp}`)}`);
    const row = page.getByRole('row', { name: mariaName });
    await expect(row).toContainText('€34,000');
    await expect(row).toContainText('1 Dec 2026');

    // ── 3. Seats tab → Raise fee → the invoice dialog is open on arrival.
    await page.goto(`/requisitions/${ids.job}?tab=seats`);
    const seat = page.getByTestId('seat-rows').locator('li', { hasText: mariaName });
    await expect(seat.getByTestId('seat-salary')).toContainText('€34,000');
    await expect(seat.getByTestId('seat-start')).toContainText('1 Dec 2026');
    await seat.getByRole('link', { name: /Raise fee/ }).click();
    await page.waitForURL(new RegExp(`/employers/${ids.employer}\\?raisePlacement=`));
    const invoiceDialog = page.getByRole('dialog');
    await expect(invoiceDialog).toBeVisible({ timeout: 20_000 });
    await expect(invoiceDialog).toContainText('Generate invoice');
    await expect(invoiceDialog).toContainText(`fee for Maria Pzero${stamp}`);
    // The header button is not hidden while the link is open.
    await expect(page.getByTestId('header-raise-fee')).toBeVisible();
    // Closing the dialog clears the deep link so it doesn't re-open.
    await page.keyboard.press('Escape');
    await expect(invoiceDialog).toBeHidden();
    await expect(page).not.toHaveURL(/raisePlacement=/);

    // ── 4. Re-adding Maria says she's already on the job.
    await page.goto(`/requisitions/${ids.job}`);
    await page.getByRole('button', { name: 'Add candidate' }).click();
    const addDialog = page.getByRole('dialog');
    await addDialog.getByPlaceholder('Search by name or email…').fill(`Pzero${stamp}`);
    await addDialog
      .getByTestId('candidate-search-results')
      .getByRole('button', { name: mariaName })
      .click();
    await addDialog.getByRole('button', { name: 'Add to shortlist' }).click();
    await expect(addDialog.getByTestId('add-candidate-notice')).toContainText(
      'already on this job at Placed',
    );
    await expect(addDialog).toBeVisible();
    await page.keyboard.press('Escape');

    // ── 5. A DRAFT job refuses Add candidate with the open-job message.
    await page.goto(`/requisitions/${ids.draftJob}`);
    await expect(page.getByTestId('add-candidate-draft-hint')).toContainText(
      'Open this job before adding or moving candidates.',
    );
    await expect(page.getByRole('button', { name: 'Add candidate' })).toHaveCount(0);
    await expect(page.getByTestId('pipeline-lock')).toContainText('Open this job');
    await expect(
      page.getByTestId('pipeline-lock').getByRole('link', { name: /Open job/ }),
    ).toBeVisible();
  } finally {
    const { db, eq, inArray, s } = m;
    const pls = await db
      .select({ id: s.placements.id })
      .from(s.placements)
      .where(eq(s.placements.employerId, ids.employer));
    const profiles = await db
      .select({ id: s.candidateProfiles.id })
      .from(s.candidateProfiles)
      .where(eq(s.candidateProfiles.personId, ids.maria));
    const matches = await db
      .select({ id: s.candidateMatches.id })
      .from(s.candidateMatches)
      .where(eq(s.candidateMatches.personId, ids.maria));
    const entries = await db
      .select({ id: s.shortlistEntries.id })
      .from(s.shortlistEntries)
      .where(eq(s.shortlistEntries.personId, ids.maria));
    const entityIds = [
      ids.employer,
      ids.job,
      ids.draftJob,
      ids.maria,
      ids.app,
      ...pls.map((p) => p.id),
      ...profiles.map((p) => p.id),
      ...matches.map((p) => p.id),
      ...entries.map((p) => p.id),
    ].filter(Boolean);
    await db.delete(s.auditEvents).where(inArray(s.auditEvents.entityId, entityIds));
    await db.delete(s.placements).where(eq(s.placements.employerId, ids.employer));
    await db.delete(s.shortlistEntries).where(eq(s.shortlistEntries.personId, ids.maria));
    await db.delete(s.candidateMatches).where(eq(s.candidateMatches.personId, ids.maria));
    await db.delete(s.jobApplications).where(eq(s.jobApplications.personId, ids.maria));
    await db.delete(s.candidateProfiles).where(eq(s.candidateProfiles.personId, ids.maria));
    await db.delete(s.persons).where(eq(s.persons.id, ids.maria));
    await db
      .delete(s.jobRequisitions)
      .where(inArray(s.jobRequisitions.id, [ids.job, ids.draftJob].filter(Boolean)));
    await db.delete(s.employers).where(eq(s.employers.id, ids.employer));
  }
});

test('a recruiter without finance authority sees "Finance issues invoices", not a fee button', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ assignedUserId: m.adminId, legalName: `P0 Place Recruiter Care ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('seed failed');
  const [job] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      assignedUserId: m.adminId,
      employerId: emp.id,
      title: `P0 Place Kitchen Porter ${stamp}`,
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      status: 'PARTIALLY_FILLED',
      positionsFilled: 1,
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!job) throw new Error('seed failed');
  const [p] = await m.db
    .insert(m.s.persons)
    .values({ firstName: 'Tomas', lastName: `Pzero${stamp}`, source: 'DIRECT' })
    .returning({ id: m.s.persons.id });
  if (!p) throw new Error('seed failed');
  const [pl] = await m.db
    .insert(m.s.placements)
    .values({
      personId: p.id,
      employerId: emp.id,
      jobRequisitionId: job.id,
      status: 'CONFIRMED',
      salary: '31000',
      salaryCurrencyCode: 'EUR',
      startDate: '2026-11-16',
    })
    .returning({ id: m.s.placements.id });
  if (!pl) throw new Error('seed failed');

  try {
    await withIsolatedUser(
      browser,
      async (page) => {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`/requisitions/${job.id}?tab=seats`);
        const seat = page.getByTestId('seat-rows').locator('li', { hasText: `Pzero${stamp}` });
        await expect(seat).toContainText('Finance issues invoices');
        await expect(seat.getByRole('button', { name: 'Raise fee' })).toBeDisabled();
        await expect(seat.getByRole('link', { name: /Raise fee/ })).toHaveCount(0);

        // A shared deep link explains instead of opening a dialog the server refuses.
        await page.goto(`/employers/${emp.id}?raisePlacement=${pl.id}&raiseRequisition=${job.id}`);
        await expect(page.getByTestId('raise-fee-notice')).toContainText('Finance issues invoices');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByTestId('header-raise-fee')).toBeDisabled();
      },
      { role: 'RECRUITER' },
    );
  } finally {
    const { db, eq, inArray, s } = m;
    await db
      .delete(s.auditEvents)
      .where(inArray(s.auditEvents.entityId, [emp.id, job.id, p.id, pl.id]));
    await db.delete(s.placements).where(eq(s.placements.id, pl.id));
    await db.delete(s.persons).where(eq(s.persons.id, p.id));
    await db.delete(s.jobRequisitions).where(eq(s.jobRequisitions.id, job.id));
    await db.delete(s.employers).where(eq(s.employers.id, emp.id));
  }
});
