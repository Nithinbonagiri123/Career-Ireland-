import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * R5 — Global Matching & Shortlists, end to end:
 *   run matching for a job from /matching → the skilled candidate outranks
 *   the unskilled one → unavailable candidates are hidden by default (and
 *   can be shown) → shortlist / dismiss → /shortlists: mark presented, add
 *   employer feedback → remove with a validated reason → removal history
 *   and the job's Activity show it → closed jobs offer no matching controls
 *   → phone width.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  const reference = await import('../src/lib/db/schema/reference');
  const details = await import('../src/lib/db/schema/candidate_details');
  const audit = await import('../src/lib/db/schema/audit_events');
  return {
    db,
    and,
    eq,
    inArray,
    sql,
    s: { ...recruitment, ...personsSchema, ...reference, ...details, ...audit },
  };
}
type M = Awaited<ReturnType<typeof dbModules>>;

async function seed(m: M, stamp: string) {
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ assignedUserId: await e2eAdminId(), legalName: `R5 Nursing Homes ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('seed failed');
  const [job, closed] = await m.db
    .insert(m.s.jobRequisitions)
    .values([
      {
        assignedUserId: await e2eAdminId(),
        employerId: emp.id,
        title: `R5 Care Assistant ${stamp}`,
        positionsRequired: 2,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
      },
      {
        assignedUserId: await e2eAdminId(),
        employerId: emp.id,
        title: `R5 Closed Role ${stamp}`,
        positionsRequired: 1,
        employmentType: 'FULL_TIME',
        status: 'CLOSED',
      },
    ])
    .returning({ id: m.s.jobRequisitions.id });
  if (!job || !closed) throw new Error('seed failed');
  const [skill] = await m.db
    .insert(m.s.skills)
    .values({ name: `R5 dementia care ${stamp}` })
    .returning({ id: m.s.skills.id });
  if (!skill) throw new Error('seed failed');
  await m.db
    .insert(m.s.requisitionSkills)
    .values({ jobRequisitionId: job.id, skillId: skill.id, isRequired: true });
  const people = await m.db
    .insert(m.s.persons)
    .values(
      ['Ann', 'Ben', 'Cara'].map((n) => ({
        firstName: `${n}${stamp}`,
        lastName: `Rfive${stamp}`,
        source: 'DIRECT' as const,
      })),
    )
    .returning({ id: m.s.persons.id });
  const [ann, ben, cara] = people;
  if (!ann || !ben || !cara) throw new Error('seed failed');
  await m.db.insert(m.s.candidateProfiles).values([
    {
      assignedUserId: await e2eAdminId(),
      personId: ann.id,
      availabilityStatus: 'AVAILABLE' as const,
    },
    {
      assignedUserId: await e2eAdminId(),
      personId: ben.id,
      availabilityStatus: 'AVAILABLE' as const,
    },
    {
      assignedUserId: await e2eAdminId(),
      personId: cara.id,
      availabilityStatus: 'TEMPORARILY_UNAVAILABLE' as const,
    },
  ]);
  await m.db.insert(m.s.candidateSkills).values([
    { personId: ann.id, skillId: skill.id },
    { personId: cara.id, skillId: skill.id },
  ]);
  return {
    employerId: emp.id,
    jobId: job.id,
    closedId: closed.id,
    skillId: skill.id,
    ann: ann.id,
    ben: ben.id,
    cara: cara.id,
    personIds: people.map((p) => p.id),
  };
}

async function cleanup(m: M, ids: Awaited<ReturnType<typeof seed>>) {
  const jobIds = [ids.jobId, ids.closedId];
  const entries = await m.db
    .select({ id: m.s.shortlistEntries.id })
    .from(m.s.shortlistEntries)
    .where(m.inArray(m.s.shortlistEntries.jobRequisitionId, jobIds));
  const matches = await m.db
    .select({ id: m.s.candidateMatches.id })
    .from(m.s.candidateMatches)
    .where(m.inArray(m.s.candidateMatches.jobRequisitionId, jobIds));
  const entityIds = [
    ...jobIds,
    ...entries.map((e) => e.id),
    ...matches.map((x) => x.id),
    ...ids.personIds,
  ];
  await m.db.delete(m.s.auditEvents).where(m.inArray(m.s.auditEvents.entityId, entityIds));
  await m.db.execute(
    m.sql`DELETE FROM audit_events WHERE entity_type = 'shortlist_entry' AND (before->>'jobRequisitionId' IN (${ids.jobId}, ${ids.closedId}) OR after->>'jobRequisitionId' IN (${ids.jobId}, ${ids.closedId}))`,
  );
  await m.db
    .delete(m.s.shortlistEntries)
    .where(m.inArray(m.s.shortlistEntries.jobRequisitionId, jobIds));
  await m.db
    .delete(m.s.candidateMatches)
    .where(m.inArray(m.s.candidateMatches.jobRequisitionId, jobIds));
  await m.db
    .delete(m.s.requisitionSkills)
    .where(m.eq(m.s.requisitionSkills.jobRequisitionId, ids.jobId));
  await m.db
    .delete(m.s.candidateSkills)
    .where(m.inArray(m.s.candidateSkills.personId, ids.personIds));
  await m.db
    .delete(m.s.candidateProfiles)
    .where(m.inArray(m.s.candidateProfiles.personId, ids.personIds));
  await m.db.delete(m.s.persons).where(m.inArray(m.s.persons.id, ids.personIds));
  await m.db.delete(m.s.skills).where(m.eq(m.s.skills.id, ids.skillId));
  await m.db.delete(m.s.jobRequisitions).where(m.inArray(m.s.jobRequisitions.id, jobIds));
  await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, ids.employerId));
}

test('R5: global matching → shortlist → presented → feedback → removal with history', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  const matchFor = async (personId: string) =>
    (
      await m.db
        .select()
        .from(m.s.candidateMatches)
        .where(
          m.and(
            m.eq(m.s.candidateMatches.jobRequisitionId, ids.jobId),
            m.eq(m.s.candidateMatches.personId, personId),
          ),
        )
    )[0];
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── Run matching for the job from the global workspace.
    await page.goto(`/matching?job=${ids.jobId}`);
    await expect(page.getByRole('heading', { name: 'Matching', level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    const run = page.getByTestId('run-matching');
    await expect(run.locator('#rm-job')).toHaveValue(ids.jobId);
    // Default minimum score is shown (50 of 100); Ann scores 45 and Ben 20,
    // so neither is added as a NEW match.
    await expect(run.locator('#rm-min')).toHaveValue('50');
    await run.getByRole('button', { name: 'Run matching' }).click();
    await expect(
      page
        .getByText(/Matching complete \(minimum score 50\).*below the minimum score of 50/)
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    expect(await matchFor(ids.ann)).toBeUndefined();
    expect(await matchFor(ids.ben)).toBeUndefined();

    // The job has skills but no occupation or location: the panel warns and
    // suggests 45 for this run — it is applied only when clicked.
    const warning = run.getByTestId('criteria-warning');
    await expect(warning).toContainText(/best possible score is 45/);
    await expect(run.locator('#rm-min')).toHaveValue('50');
    await warning.getByRole('button', { name: 'Use 45 for this run' }).click();
    await expect(run.locator('#rm-min')).toHaveValue('45');
    await expect(warning).toHaveCount(0);
    await run.getByRole('button', { name: 'Run matching' }).click();
    await expect(page.getByText(/Matching complete \(minimum score 45\)/).first()).toBeVisible({
      timeout: 30_000,
    });
    expect((await matchFor(ids.ann))?.score).toBe(45);
    expect(await matchFor(ids.ben)).toBeUndefined();

    // An invalid minimum is explained in the panel.
    await run.locator('#rm-min').fill('150');
    await run.getByRole('button', { name: 'Run matching' }).click();
    await expect(run.getByRole('alert')).toContainText(/cannot be above 100/, { timeout: 15_000 });

    // Lower the minimum to 0 to include weak candidates.
    await run.locator('#rm-min').fill('0');
    await run.getByRole('button', { name: 'Run matching' }).click();
    await expect(page.getByText(/Matching complete \(minimum score 0\)/).first()).toBeVisible({
      timeout: 30_000,
    });

    const ann = await matchFor(ids.ann);
    const ben = await matchFor(ids.ben);
    expect(ann?.score).toBeGreaterThan(ben?.score ?? 0);
    expect(await matchFor(ids.cara)).toBeUndefined(); // unavailable: left out by default

    // ── Filtered list: Ann and Ben listed with links; Ann's reasons mention the skill.
    await page.goto(`/matching?job=${ids.jobId}&q=Rfive${stamp}`);
    const rows = page.getByTestId('match-rows');
    const annRow = rows.locator('li').filter({ hasText: `Ann${stamp}` });
    await expect(annRow).toBeVisible({ timeout: 15_000 });
    await expect(annRow.getByRole('link', { name: `Ann${stamp} Rfive${stamp}` })).toHaveAttribute(
      'href',
      `/candidates/${ids.ann}`,
    );
    await expect(annRow.getByRole('link', { name: `R5 Care Assistant ${stamp}` })).toHaveAttribute(
      'href',
      `/requisitions/${ids.jobId}`,
    );
    await annRow.getByText('Why this score').click();
    await expect(annRow).toContainText(/skill/i);

    // ── Include unavailable: run again with the box ticked → Cara appears.
    await page.getByTestId('run-matching').locator('#rm-job').selectOption(ids.jobId);
    await page.getByTestId('run-matching').locator('#rm-min').fill('0');
    await page.getByText('Include placed / unavailable candidates').click();
    await page.getByTestId('run-matching').getByRole('button', { name: 'Run matching' }).click();
    await expect(page.getByText(/Matching complete/).first()).toBeVisible({ timeout: 30_000 });
    await page.goto(`/matching?job=${ids.jobId}&q=Rfive${stamp}`);
    await expect(page.getByTestId('hidden-unavailable')).toBeVisible({ timeout: 15_000 });
    await expect(rows).not.toContainText(`Cara${stamp}`);
    await page.goto(`/matching?job=${ids.jobId}&q=Rfive${stamp}&availability=all`);
    await expect(rows).toContainText(`Cara${stamp}`, { timeout: 15_000 });

    // ── Shortlist Ann, dismiss Ben.
    await page.goto(`/matching?job=${ids.jobId}&q=Rfive${stamp}`);
    await rows
      .locator('li')
      .filter({ hasText: `Ann${stamp}` })
      .getByRole('button', { name: 'Shortlist' })
      .click();
    await expect(
      page.getByText(new RegExp(`Ann${stamp} Rfive${stamp} shortlisted`)).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await rows
      .locator('li')
      .filter({ hasText: `Ben${stamp}` })
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(
      page.getByText(new RegExp(`Ben${stamp} Rfive${stamp} dismissed`)).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    expect((await matchFor(ids.ann))?.status).toBe('SHORTLISTED');
    expect((await matchFor(ids.ben))?.status).toBe('DISMISSED');

    // ── Shortlists: presented → feedback.
    await page.goto(`/shortlists?job=${ids.jobId}`);
    const sl = page.getByTestId('shortlist-rows');
    let row = sl.locator('li').filter({ hasText: `Ann${stamp}` });
    await expect(row).toContainText('Not presented', { timeout: 15_000 });
    await row.getByRole('button', { name: 'Mark presented' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/recorded as presented/).first()).toBeVisible({ timeout: 15_000 });
    row = sl.locator('li').filter({ hasText: `Ann${stamp}` });
    await expect(row).toContainText('Awaiting feedback', { timeout: 15_000 });
    await row.getByRole('button', { name: 'Add feedback' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('#sl-feedback').fill('Invite to interview next week');
    await dialog.getByRole('button', { name: 'Save feedback' }).click();
    await expect(page.getByText('Employer feedback saved').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(row).toContainText('Invite to interview next week', { timeout: 15_000 });

    // ── Remove: reason validated, then removed with a full snapshot.
    await row.getByRole('button', { name: 'Remove' }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#sl-reason').fill('no');
    await dialog.getByRole('button', { name: 'Remove from shortlist' }).click();
    await expect(dialog.getByText(/at least 5 characters/)).toBeVisible();
    await dialog.locator('#sl-reason').fill('Employer filled the role internally');
    await dialog.getByRole('button', { name: 'Remove from shortlist' }).click();
    await expect(page.getByText(/removed from the shortlist/).first()).toBeVisible({
      timeout: 15_000,
    });
    expect((await matchFor(ids.ann))?.status).toBe('REVIEWED');
    const [snap] = await m.db
      .select()
      .from(m.s.auditEvents)
      .where(
        m.and(
          m.eq(m.s.auditEvents.action, 'REMOVED'),
          m.sql`${m.s.auditEvents.before}->>'personId' = ${ids.ann}`,
        ),
      );
    expect(snap?.before).toMatchObject({
      jobRequisitionId: ids.jobId,
      employerFeedback: 'Invite to interview next week',
    });
    expect(snap?.context).toMatchObject({ reason: 'Employer filled the role internally' });

    // ── Removal history + the job's Activity.
    await page.goto(`/shortlists?view=removed&job=${ids.jobId}`);
    const removal = page.getByTestId('removal-rows').locator('li').first();
    await expect(removal).toContainText(`Ann${stamp}`, { timeout: 15_000 });
    await expect(removal).toContainText('Employer filled the role internally');
    await expect(removal).toContainText(/\d{2}:\d{2}/);
    await page.goto(`/requisitions/${ids.jobId}?tab=activity`);
    await expect(page.getByTestId('activity-rows')).toContainText(
      /removed from shortlist — reason: Employer filled the role internally/,
      { timeout: 15_000 },
    );

    // ── Closed job: no matching / add-candidate controls.
    await page.goto(`/requisitions/${ids.closedId}`);
    await expect(page.getByRole('heading', { name: `R5 Closed Role ${stamp}` })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /Add candidate/ })).toHaveCount(0);
  } finally {
    await cleanup(m, ids);
  }
});

test('R5 workspaces render at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/matching', '/shortlists', '/shortlists?view=removed']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, url).toBeLessThanOrEqual(1);
  }
});
