import { expect, type Page, test } from '@playwright/test';

/**
 * R2 — Job Requirements workspace, browser-level proof:
 *   1. KPIs and Seats derive from placements by the R0 rule; historical
 *      overfill is shown in full with a warning and zero open seats.
 *   2. All seven tabs open from `?tab=`; no tab still means Pipeline (old
 *      bookmarks + R1 "Open pipeline" links); clicking writes the URL.
 *   3. `?close=1` opens the close dialog on an open job, never on a closed one.
 *   4. Edit keeps the current employer selected (server-side search
 *      selector); saving is recorded in the Activity tab with a timestamp.
 *   5. Add candidate searches the server and shortlists the pick.
 *   6. Interviews & offers is read-only.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  return { db, eq, inArray, sql, s: { ...recruitment, ...personsSchema } };
}

type M = Awaited<ReturnType<typeof dbModules>>;

async function seed(m: M, stamp: string) {
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ legalName: `R2 Care Group ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('employer seed failed');
  const [open, closed] = await m.db
    .insert(m.s.jobRequisitions)
    .values([
      {
        employerId: emp.id,
        title: `R2 Healthcare Assistants ${stamp}`,
        positionsRequired: 2,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
        location: 'Cork',
      },
      {
        employerId: emp.id,
        title: `R2 Closed Role ${stamp}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'CLOSED',
      },
    ])
    .returning({ id: m.s.jobRequisitions.id });
  if (!open || !closed) throw new Error('requisition seed failed');
  const people = await m.db
    .insert(m.s.persons)
    .values(
      ['Aoife', 'Brian', 'Ciara', 'Dara', 'Eoin'].map((first) => ({
        firstName: `${first}${stamp}`,
        lastName: 'Testperson',
        email: `${first.toLowerCase()}-${stamp}@example.test`,
        source: 'DIRECT' as const,
      })),
    )
    .returning({ id: m.s.persons.id });
  const [a, b, c, d] = people;
  if (!a || !b || !c || !d) throw new Error('person seed failed');
  // Historical overfill: three seat-holders on a two-position job, inserted
  // directly (as legacy data would be) — the R0 guards refuse this today.
  await m.db.insert(m.s.placements).values([
    {
      personId: a.id,
      employerId: emp.id,
      jobRequisitionId: open.id,
      status: 'CONFIRMED',
      startDate: '2026-11-02',
    },
    { personId: b.id, employerId: emp.id, jobRequisitionId: open.id, status: 'STARTED' },
    { personId: c.id, employerId: emp.id, jobRequisitionId: open.id, status: 'CONFIRMED' },
    { personId: d.id, employerId: emp.id, jobRequisitionId: open.id, status: 'PROPOSED' },
  ]);
  return {
    employerId: emp.id,
    openId: open.id,
    closedId: closed.id,
    personIds: people.map((p) => p.id),
  };
}

async function cleanup(m: M, ids: Awaited<ReturnType<typeof seed>>) {
  const reqIds = [ids.openId, ids.closedId];
  const list = m.sql.raw(`('${reqIds.join("','")}')`);
  await m.db.execute(m.sql`DELETE FROM audit_events WHERE entity_id IN (
    SELECT id::text FROM job_requisitions WHERE id IN ${list}
    UNION SELECT id::text FROM candidate_matches WHERE job_requisition_id IN ${list}
    UNION SELECT id::text FROM shortlist_entries WHERE job_requisition_id IN ${list}
    UNION SELECT id::text FROM placements WHERE job_requisition_id IN ${list})`);
  await m.db
    .delete(m.s.shortlistEntries)
    .where(m.inArray(m.s.shortlistEntries.jobRequisitionId, reqIds));
  await m.db
    .delete(m.s.candidateMatches)
    .where(m.inArray(m.s.candidateMatches.jobRequisitionId, reqIds));
  await m.db.delete(m.s.placements).where(m.inArray(m.s.placements.jobRequisitionId, reqIds));
  await m.db.delete(m.s.jobRequisitions).where(m.inArray(m.s.jobRequisitions.id, reqIds));
  await m.db.delete(m.s.persons).where(m.inArray(m.s.persons.id, ids.personIds));
  await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, ids.employerId));
}

const kpi = (page: Page, label: string) => page.getByTestId(`kpi-${label}`);

test('R2 workspace: seats, KPIs, tabs, close dialog, edit + activity, add candidate', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── Default tab is Pipeline (old bookmarks keep working).
    await page.goto(`/requisitions/${ids.openId}`);
    await expect(
      page.getByRole('heading', { name: `R2 Healthcare Assistants ${stamp}` }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: /Pipeline/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // ── KPIs: 2 positions, 3 seat-holders, 0 remaining, over capacity by 1.
    await expect(kpi(page, 'Positions').getByText('2', { exact: true })).toBeVisible();
    await expect(kpi(page, 'Confirmed placed').getByText('3', { exact: true })).toBeVisible();
    await expect(kpi(page, 'Remaining').getByText('0', { exact: true })).toBeVisible();
    await expect(kpi(page, 'Remaining')).toContainText('Over capacity by 1');

    // ── Seats: 2 filled + 1 over capacity, no open seat, proposed listed apart.
    await page.getByRole('tab', { name: /Seats/ }).click();
    await expect(page).toHaveURL(/tab=seats/);
    await expect(page.getByTestId('seats-overfilled')).toBeVisible();
    const seatRows = page.getByTestId('seat-rows');
    await expect(seatRows.locator('[data-seat-kind="filled"]')).toHaveCount(2);
    await expect(seatRows.locator('[data-seat-kind="over_capacity"]')).toHaveCount(1);
    await expect(seatRows.locator('[data-seat-kind="open"]')).toHaveCount(0);
    await expect(
      page.getByTestId('non-seat-rows').locator('[data-non-seat="proposed"]'),
    ).toHaveCount(1);
    await expect(page.getByTestId('start-pending').first()).toBeVisible();

    // ── Every tab opens from a bookmarked URL.
    for (const [tab, marker] of [
      ['overview', /Work log|Required skills|Skills/i],
      ['interviews', /Times shown in Irish time/],
      ['checklists', /Work Permit Checklists/],
      ['billing', /Billing for this job/],
      ['activity', /Every recorded change/],
    ] as const) {
      await page.goto(`/requisitions/${ids.openId}?tab=${tab}`);
      await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15_000 });
    }
    // Interviews & offers (functional since R3) shows both panels.
    await page.goto(`/requisitions/${ids.openId}?tab=interviews`);
    const io = page.getByTestId('interviews-offers');
    await expect(io).toBeVisible();
    await expect(io.getByText('Offers', { exact: true })).toBeVisible();

    // ── R1 employer link target (?tab=pipeline) lands on Pipeline.
    await page.goto(`/requisitions/${ids.openId}?tab=pipeline`);
    await expect(page.getByRole('tab', { name: /Pipeline/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('requisition-employer-link')).toHaveAttribute(
      'href',
      `/employers/${ids.employerId}`,
    );

    // ── ?close=1 opens the dialog on an open job, never on a closed one.
    await page.goto(`/requisitions/${ids.openId}?close=1`);
    await expect(page.getByRole('dialog').getByText('Close this requisition?')).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('Escape');
    await page.goto(`/requisitions/${ids.closedId}?close=1`);
    await expect(page.getByRole('heading', { name: `R2 Closed Role ${stamp}` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Close this requisition?')).toHaveCount(0);

    // ── Edit keeps the current employer; the save shows up in Activity.
    await page.goto(`/requisitions/${ids.openId}?edit=1`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit requisition')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('#jr-employer')).toContainText(`R2 Care Group ${stamp}`);
    await dialog.locator('#jr-location').fill('Galway');
    await dialog.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Requisition updated').first()).toBeVisible({ timeout: 15_000 });
    const [after] = await m.db
      .select({
        employerId: m.s.jobRequisitions.employerId,
        location: m.s.jobRequisitions.location,
      })
      .from(m.s.jobRequisitions)
      .where(m.eq(m.s.jobRequisitions.id, ids.openId));
    expect(after).toEqual({ employerId: ids.employerId, location: 'Galway' });
    await page.goto(`/requisitions/${ids.openId}?tab=activity`);
    const activity = page.getByTestId('activity-rows');
    await expect(activity.getByText(/^Job /).first()).toBeVisible({ timeout: 15_000 });
    await expect(activity.locator('li').first()).toContainText(/\d{2}:\d{2}/);

    // ── Add candidate: server search → shortlist.
    await page.goto(`/requisitions/${ids.openId}`);
    await page
      .getByRole('button', { name: /Add candidate/ })
      .first()
      .click();
    const add = page.getByRole('dialog');
    await add.getByPlaceholder('Search by name or email…').fill(`Eoin${stamp}`);
    const results = add.getByTestId('candidate-search-results');
    await results.getByRole('button', { name: new RegExp(`Eoin${stamp}`) }).click();
    await add.getByRole('button', { name: /Add to shortlist/ }).click();
    await expect(
      page.getByText(new RegExp(`Eoin${stamp} Testperson added to Shortlisted`)),
    ).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await cleanup(m, ids);
  }
});

test('R2 workspace renders at phone width', async ({ page }) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/requisitions/${ids.openId}?tab=seats`);
    await expect(page.getByTestId('seat-rows')).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await cleanup(m, ids);
  }
});
