import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * R3 — Interviews & Offers, end to end in the requisition workspace:
 *   schedule (moves a shortlisted candidate to Interview) → validation shown
 *   in the dialog → record result + feedback for a past interview → create
 *   offer → record as sent → record acceptance → place through R0's guarded
 *   action → the seat appears on Seats & placements. Bookmarked tab URL
 *   keeps working.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  const io = await import('../src/lib/db/schema/interviews_offers');
  const usersSchema = await import('../src/lib/db/schema/users');
  return { db, eq, inArray, sql, s: { ...recruitment, ...personsSchema, ...io, ...usersSchema } };
}
type M = Awaited<ReturnType<typeof dbModules>>;

async function seed(m: M, stamp: string) {
  const [admin] = await m.db
    .select({ id: m.s.users.id })
    .from(m.s.users)
    .where(m.eq(m.s.users.email, 'e2e-admin@ireland-careers.test'));
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ assignedUserId: await e2eAdminId(), legalName: `R3 Clinic ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp || !admin) throw new Error('seed failed');
  const [req] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      assignedUserId: await e2eAdminId(),
      employerId: emp.id,
      title: `R3 Staff Nurse ${stamp}`,
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!req) throw new Error('seed failed');
  const [ann, ben] = await m.db
    .insert(m.s.persons)
    .values([
      { firstName: `Ann${stamp}`, lastName: 'Rthree', source: 'DIRECT' as const },
      { firstName: `Ben${stamp}`, lastName: 'Rthree', source: 'DIRECT' as const },
    ])
    .returning({ id: m.s.persons.id });
  if (!ann || !ben) throw new Error('seed failed');
  const [annApp, benApp] = await m.db
    .insert(m.s.jobApplications)
    .values([
      { personId: ann.id, jobRequisitionId: req.id, status: 'SHORTLISTED' },
      { personId: ben.id, jobRequisitionId: req.id, status: 'INTERVIEW' },
    ])
    .returning({ id: m.s.jobApplications.id });
  if (!annApp || !benApp) throw new Error('seed failed');
  // Ben's interview already happened (yesterday) and needs a result.
  await m.db.insert(m.s.interviews).values({
    jobApplicationId: benApp.id,
    scheduledAt: new Date(Date.now() - 24 * 3600_000),
    mode: 'VIDEO',
    location: 'https://meet.example.test/ben',
    scheduledByUserId: admin.id,
  });
  return {
    employerId: emp.id,
    reqId: req.id,
    personIds: [ann.id, ben.id],
    annApp: annApp.id,
    benApp: benApp.id,
  };
}

async function cleanup(m: M, ids: Awaited<ReturnType<typeof seed>>) {
  const apps = [ids.annApp, ids.benApp];
  const list = m.sql.raw(`('${apps.join("','")}')`);
  await m.db.execute(m.sql`DELETE FROM audit_events WHERE entity_id IN (
    SELECT id::text FROM interviews WHERE job_application_id IN ${list}
    UNION SELECT id::text FROM offers WHERE job_application_id IN ${list}
    UNION SELECT id::text FROM placements WHERE job_requisition_id = ${ids.reqId}
    UNION SELECT ${ids.reqId}::text
    UNION SELECT unnest(ARRAY[${m.sql.raw(`'${apps.join("','")}'`)}]))`);
  await m.db.delete(m.s.offers).where(m.inArray(m.s.offers.jobApplicationId, apps));
  await m.db.delete(m.s.interviews).where(m.inArray(m.s.interviews.jobApplicationId, apps));
  await m.db.delete(m.s.placements).where(m.eq(m.s.placements.jobRequisitionId, ids.reqId));
  await m.db.delete(m.s.jobApplications).where(m.inArray(m.s.jobApplications.id, apps));
  await m.db.delete(m.s.jobRequisitions).where(m.eq(m.s.jobRequisitions.id, ids.reqId));
  await m.db.delete(m.s.persons).where(m.inArray(m.s.persons.id, ids.personIds));
  await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, ids.employerId));
}

function futureLocal(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T10:30`;
}

async function expand(page: Page, rowsTestId: string, text: RegExp) {
  const row = page.getByTestId(rowsTestId).locator('li').filter({ hasText: text }).first();
  // Rows keep their open state across refreshes — only open if closed.
  const isOpen = await row.locator('details').evaluate((d) => (d as HTMLDetailsElement).open);
  if (!isOpen) await row.locator('summary').click();
  return row;
}

test('R3: schedule, result + feedback, offer lifecycle, placement hand-off', async ({ page }) => {
  test.setTimeout(180_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/requisitions/${ids.reqId}?tab=interviews`);
    const io = page.getByTestId('interviews-offers');
    await expect(io).toBeVisible({ timeout: 20_000 });
    // Ben's past interview is waiting for a result (default view).
    await expect(io.getByRole('button', { name: /Needs result/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // ── Validation is shown inside the dialog.
    await io.getByRole('button', { name: /Schedule interview/ }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Schedule interview$/ }).click();
    await expect(dialog.getByText(/Enter a date and time/)).toBeVisible();

    // ── Schedule Ann (shortlisted → Interview).
    await dialog.locator('#iv-candidate').selectOption(ids.annApp);
    await dialog.locator('#iv-when').fill(futureLocal(3));
    await dialog.locator('#iv-location').fill('https://meet.example.test/ann');
    await dialog.locator('#iv-interviewers').fill('Mary Walsh (Director of Nursing)');
    await dialog.getByRole('button', { name: /^Schedule interview$/ }).click();
    await expect(page.getByText('Interview scheduled').first()).toBeVisible({ timeout: 15_000 });
    const [annApp] = await m.db
      .select({ status: m.s.jobApplications.status })
      .from(m.s.jobApplications)
      .where(m.eq(m.s.jobApplications.id, ids.annApp));
    expect(annApp?.status).toBe('INTERVIEW');
    await io.getByRole('button', { name: /^Upcoming/ }).click();
    await expect(page.getByTestId('interview-rows')).toContainText(`Ann${stamp}`);
    await expect(page.getByTestId('interview-rows')).toContainText(/10:30/);

    // ── Record Ben's result with feedback.
    await io.getByRole('button', { name: /Needs result/ }).click();
    let row = await expand(page, 'interview-rows', new RegExp(`Ben${stamp}`));
    await row.getByRole('button', { name: 'Record result' }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#iv-outcome').selectOption('PASS');
    await dialog.locator('#iv-feedback').fill('Excellent clinical judgement.');
    await dialog.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Interview result recorded').first()).toBeVisible({
      timeout: 15_000,
    });
    await io.getByRole('button', { name: /^Completed/ }).click();
    row = await expand(page, 'interview-rows', new RegExp(`Ben${stamp}`));
    await expect(row).toContainText('Excellent clinical judgement.');

    // ── Offer: create from the passed interview → sent → accepted.
    await row.getByRole('button', { name: /Create offer/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#of-amount').fill('38500');
    await dialog.getByRole('button', { name: /Create draft offer/ }).click();
    await expect(page.getByText('Draft offer created').first()).toBeVisible({ timeout: 15_000 });
    let offer = await expand(page, 'offer-rows', new RegExp(`Ben${stamp}`));
    await offer.getByRole('button', { name: 'Record as sent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Record as sent' }).click();
    await expect(page.getByText('Offer recorded as sent').first()).toBeVisible({ timeout: 15_000 });
    offer = await expand(page, 'offer-rows', new RegExp(`Ben${stamp}`));
    await offer.getByRole('button', { name: 'Record acceptance' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Record acceptance' }).click();
    await expect(page.getByText('Acceptance recorded').first()).toBeVisible({ timeout: 15_000 });

    // Acceptance alone placed nobody.
    const before = await m.db
      .select()
      .from(m.s.placements)
      .where(m.eq(m.s.placements.jobRequisitionId, ids.reqId));
    expect(before).toHaveLength(0);

    // ── Place through R0's guarded action.
    await io.getByRole('button', { name: /^Accepted/ }).click();
    offer = await expand(page, 'offer-rows', new RegExp(`Ben${stamp}`));
    await offer.getByRole('button', { name: 'Place candidate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Place candidate' }).click();
    await expect(page.getByText(new RegExp(`Ben${stamp} Rthree placed`)).first()).toBeVisible({
      timeout: 15_000,
    });

    // The same view updates in place: the offer now shows as placed.
    await expect(page.getByTestId('offer-rows')).toContainText(/Placed · confirmed/i, {
      timeout: 15_000,
    });

    // The seat is visible on Seats & placements (bookmarkable tab URL).
    await page.goto(`/requisitions/${ids.reqId}?tab=seats`);
    await expect(
      page
        .getByTestId('seat-rows')
        .locator('[data-seat-kind="filled"]')
        .filter({
          hasText: `Ben${stamp}`,
        }),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await cleanup(m, ids);
  }
});

test('R3 Interviews & Offers renders at phone width', async ({ page }) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/requisitions/${ids.reqId}?tab=interviews`);
    await expect(page.getByTestId('interviews-offers')).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await cleanup(m, ids);
  }
});
