import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * R4 — Campaigns & Prospects, end to end:
 *   create a campaign for an employer's job (draft) → add an advertisement →
 *   activate → run the ad → record an existing person as a prospect →
 *   duplicate new-person capture is refused in the dialog → record a new
 *   person → screen → convert with confirmation (+ shortlist on the job, no
 *   application) → follow-up → not suitable needs a reason → activity →
 *   job / employer links → complete (ads close) → archive (read only).
 *   Plus: "Start a campaign" deep link pre-selects the job; phone width.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  const campaigns = await import('../src/lib/db/schema/campaigns');
  const activities = await import('../src/lib/db/schema/activities');
  const audit = await import('../src/lib/db/schema/audit_events');
  return {
    db,
    and,
    eq,
    inArray,
    sql,
    s: { ...recruitment, ...personsSchema, ...campaigns, ...activities, ...audit },
  };
}
type M = Awaited<ReturnType<typeof dbModules>>;

async function seed(m: M, stamp: string) {
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ assignedUserId: await e2eAdminId(), legalName: `R4 Care Homes ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('seed failed');
  const [job] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      assignedUserId: await e2eAdminId(),
      employerId: emp.id,
      title: `R4 Care Assistant ${stamp}`,
      positionsRequired: 3,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!job) throw new Error('seed failed');
  const [ann] = await m.db
    .insert(m.s.persons)
    .values({
      firstName: `Ann${stamp}`,
      lastName: `Rfour${stamp}`,
      email: `ann-${stamp}@example.test`,
      source: 'DIRECT' as const,
    })
    .returning({ id: m.s.persons.id });
  if (!ann) throw new Error('seed failed');
  return { employerId: emp.id, jobId: job.id, annId: ann.id };
}

async function cleanup(m: M, stamp: string, ids: Awaited<ReturnType<typeof seed>>) {
  const camps = await m.db
    .select({ id: m.s.recruitmentCampaigns.id })
    .from(m.s.recruitmentCampaigns)
    .where(m.sql`${m.s.recruitmentCampaigns.name} LIKE ${`%${stamp}%`}`);
  const campIds = camps.map((c) => c.id);
  const ads = campIds.length
    ? await m.db
        .select({ id: m.s.advertisements.id })
        .from(m.s.advertisements)
        .where(m.inArray(m.s.advertisements.campaignId, campIds))
    : [];
  const adIds = ads.map((a) => a.id);
  const prospects = adIds.length
    ? await m.db
        .select({ id: m.s.recruitmentProspects.id })
        .from(m.s.recruitmentProspects)
        .where(m.inArray(m.s.recruitmentProspects.advertisementId, adIds))
    : [];
  const people = await m.db
    .select({ id: m.s.persons.id })
    .from(m.s.persons)
    .where(m.sql`${m.s.persons.lastName} LIKE ${`%${stamp}%`}`);
  const personIds = people.map((p) => p.id);
  const taskIds = personIds.length
    ? (
        await m.db
          .select({ id: m.s.tasks.id })
          .from(m.s.tasks)
          .where(m.inArray(m.s.tasks.personId, personIds))
      ).map((t) => t.id)
    : [];
  const profiles = personIds.length
    ? (
        await m.db
          .select({ id: m.s.candidateProfiles.id })
          .from(m.s.candidateProfiles)
          .where(m.inArray(m.s.candidateProfiles.personId, personIds))
      ).map((p) => p.id)
    : [];
  const sl = (
    await m.db
      .select({ id: m.s.shortlistEntries.id })
      .from(m.s.shortlistEntries)
      .where(m.eq(m.s.shortlistEntries.jobRequisitionId, ids.jobId))
  ).map((s) => s.id);
  const cm = (
    await m.db
      .select({ id: m.s.candidateMatches.id })
      .from(m.s.candidateMatches)
      .where(m.eq(m.s.candidateMatches.jobRequisitionId, ids.jobId))
  ).map((c) => c.id);
  const entityIds = [
    ...campIds,
    ...adIds,
    ...prospects.map((p) => p.id),
    ...personIds,
    ...taskIds,
    ...profiles,
    ...sl,
    ...cm,
    ids.jobId,
  ];
  if (entityIds.length) {
    await m.db.delete(m.s.auditEvents).where(m.inArray(m.s.auditEvents.entityId, entityIds));
  }
  if (taskIds.length) await m.db.delete(m.s.tasks).where(m.inArray(m.s.tasks.id, taskIds));
  if (adIds.length) {
    await m.db.delete(m.s.tasks).where(m.inArray(m.s.tasks.advertisementId, adIds));
    await m.db
      .delete(m.s.recruitmentProspects)
      .where(m.inArray(m.s.recruitmentProspects.advertisementId, adIds));
    await m.db.delete(m.s.advertisements).where(m.inArray(m.s.advertisements.id, adIds));
  }
  if (campIds.length) {
    await m.db
      .delete(m.s.recruitmentCampaigns)
      .where(m.inArray(m.s.recruitmentCampaigns.id, campIds));
  }
  await m.db
    .delete(m.s.shortlistEntries)
    .where(m.eq(m.s.shortlistEntries.jobRequisitionId, ids.jobId));
  await m.db
    .delete(m.s.candidateMatches)
    .where(m.eq(m.s.candidateMatches.jobRequisitionId, ids.jobId));
  if (personIds.length) {
    await m.db
      .delete(m.s.candidateProfiles)
      .where(m.inArray(m.s.candidateProfiles.personId, personIds));
    await m.db.delete(m.s.persons).where(m.inArray(m.s.persons.id, personIds));
  }
  await m.db.delete(m.s.jobRequisitions).where(m.eq(m.s.jobRequisitions.id, ids.jobId));
  await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, ids.employerId));
}

async function expand(page: Page, name: RegExp) {
  const row = page.getByTestId('prospect-rows').locator('li').filter({ hasText: name }).first();
  const isOpen = await row.locator('details').evaluate((d) => (d as HTMLDetailsElement).open);
  if (!isOpen) await row.locator('summary').click();
  return row;
}

test('R4: campaign lifecycle, prospect capture, screening, conversion hand-off', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── Create: employer search narrows the jobs; starts as Draft.
    await page.goto('/campaigns');
    await page.getByRole('button', { name: /New campaign/ }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Create campaign$/ }).click();
    await expect(dialog.getByText(/at least 2 characters/)).toBeVisible();
    await dialog.locator('#cm-name').fill(`R4 Spring intake ${stamp}`);
    // P0 (owner decision 7): pick "For a job", then the job; the employer follows.
    await dialog.getByRole('button', { name: 'For a job' }).click();
    await dialog.locator('#cm-job-search').fill(`R4 Care Homes ${stamp}`);
    await dialog
      .getByTestId('campaign-job-results')
      .getByRole('button', { name: new RegExp(`R4 Care Assistant ${stamp}`) })
      .click();
    await expect(dialog.getByTestId('campaign-employer-readonly')).toHaveText(
      `R4 Care Homes ${stamp}`,
    );
    await dialog.getByRole('button', { name: /^Create campaign$/ }).click();
    await expect(page.getByText('Campaign created').first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const [campaign] = await m.db
      .select()
      .from(m.s.recruitmentCampaigns)
      .where(m.eq(m.s.recruitmentCampaigns.name, `R4 Spring intake ${stamp}`));
    expect(campaign?.status).toBe('DRAFT');
    expect(campaign?.jobRequisitionId).toBe(ids.jobId);
    const cid = campaign?.id ?? '';

    // ── Workspace: next action asks for an ad; add one (draft while campaign is draft).
    await page.goto(`/campaigns/${cid}`);
    await expect(page.getByRole('heading', { name: `R4 Spring intake ${stamp}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Record the first advertisement/)).toBeVisible();
    await page.getByRole('tab', { name: /Advertisements/ }).click();
    await expect(page).toHaveURL(/tab=ads/);
    await page.getByRole('button', { name: /New advertisement/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#ad-country').fill('Ireland');
    await dialog.locator('#ad-platform').fill('IrishJobs');
    await dialog.locator('#ad-start').fill('2026-11-01');
    await dialog.locator('#ad-expiry').fill('2026-10-01');
    await dialog.getByRole('button', { name: 'Add advertisement' }).click();
    await expect(dialog.getByText(/Expiry must be after/).first()).toBeVisible();
    await dialog.locator('#ad-expiry').fill('2026-12-15');
    await dialog.getByRole('button', { name: 'Add advertisement' }).click();
    await expect(page.getByText('Advertisement added').first()).toBeVisible({ timeout: 15_000 });

    // ── Activate, then set the ad running.
    await page.getByRole('button', { name: /^Activate$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText('Campaign activated').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('main').getByText('Active', { exact: true }).first()).toBeVisible();
    await page
      .getByTestId('ad-rows')
      .getByRole('button', { name: /Edit advertisement Ireland/ })
      .click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#ad-status').selectOption('ACTIVE');
    await dialog.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Advertisement updated').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ad-rows')).toContainText('Marked live');

    // ── Prospects: existing person.
    await page.getByRole('tab', { name: /Prospects/ }).click();
    await page
      .getByTestId('campaign-prospects')
      .getByRole('button', { name: 'Record prospect' })
      .click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#pr-search').fill(`Ann${stamp}`);
    await dialog
      .getByTestId('prospect-person-results')
      .getByRole('button', { name: new RegExp(`Ann${stamp}`) })
      .click();
    await dialog.getByRole('button', { name: /^Record prospect$/ }).click();
    await expect(page.getByText('Prospect recorded').first()).toBeVisible({ timeout: 15_000 });

    // ── New person that duplicates Ann's email is refused inside the dialog.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByTestId('campaign-prospects')
      .getByRole('button', { name: 'Record prospect' })
      .click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'New person' }).click();
    await dialog.locator('#pr-first').fill('Someone');
    await dialog.locator('#pr-last').fill(`Else${stamp}`);
    await dialog.locator('#pr-email').fill(`ANN-${stamp}@example.test`);
    await dialog.getByRole('button', { name: /^Record prospect$/ }).click();
    await expect(dialog.getByText(/may already exist/)).toBeVisible({ timeout: 15_000 });
    // A genuinely new person is created (source: advertisement).
    await dialog.locator('#pr-first').fill(`Ben${stamp}`);
    await dialog.locator('#pr-last').fill(`Rfour${stamp}`);
    await dialog.locator('#pr-email').fill(`ben-${stamp}@example.test`);
    await dialog.getByRole('button', { name: /^Record prospect$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('prospect-rows')).toContainText(`Ben${stamp}`, {
      timeout: 15_000,
    });
    const [ben] = await m.db
      .select()
      .from(m.s.persons)
      .where(m.eq(m.s.persons.email, `ben-${stamp}@example.test`));
    expect(ben?.source).toBe('ADVERTISEMENT');

    // ── Screen Ann, then convert with the confirmation + shortlist.
    await expect(page.getByTestId('prospect-rows')).toContainText(`Ann${stamp}`);
    let row = await expand(page, new RegExp(`Ann${stamp}`));
    await row.getByRole('button', { name: 'Mark screened' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark screened' }).click();
    await expect(
      page.getByText(new RegExp(`Ann${stamp} Rfour${stamp} marked screened`)).first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /^Ready to convert/ }).click();
    row = await expand(page, new RegExp(`Ann${stamp}`));
    await row.getByRole('button', { name: /Convert to candidate/ }).click();
    dialog = page.getByRole('dialog');
    const convert = dialog.getByRole('button', { name: 'Convert to candidate' });
    await expect(convert).toBeDisabled();
    await dialog.getByText(/Also add to the shortlist/).click();
    await dialog.getByText(/has been screened and should become a candidate/).click();
    await convert.click();
    await expect(page.getByText(/converted to candidate/).first()).toBeVisible({ timeout: 15_000 });
    const [profile] = await m.db
      .select()
      .from(m.s.candidateProfiles)
      .where(m.eq(m.s.candidateProfiles.personId, ids.annId));
    expect(profile).toBeTruthy();
    const shortlist = await m.db
      .select()
      .from(m.s.shortlistEntries)
      .where(m.eq(m.s.shortlistEntries.personId, ids.annId));
    expect(shortlist.map((s) => s.jobRequisitionId)).toEqual([ids.jobId]);
    const apps = await m.db
      .select()
      .from(m.s.jobApplications)
      .where(m.eq(m.s.jobApplications.personId, ids.annId));
    expect(apps).toHaveLength(0);

    // ── Ben: follow-up, then not suitable (reason required).
    await page.getByRole('button', { name: /^To screen/ }).click();
    row = await expand(page, new RegExp(`Ben${stamp}`));
    await row.getByRole('button', { name: /Follow-up/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#fu-date').fill('2030-01-15');
    await dialog.getByRole('button', { name: 'Save follow-up' }).click();
    await expect(page.getByText('Follow-up saved').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('prospect-rows')).toContainText(
      /Follow-up .*15 Jan 2030 · 09:00/,
    );
    row = await expand(page, new RegExp(`Ben${stamp}`));
    await row.getByRole('button', { name: 'Mark not suitable' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Mark not suitable' }).click();
    await expect(dialog.getByText(/at least 3 characters/).first()).toBeVisible();
    await dialog.locator('#ps-note').fill('No care certificate');
    await dialog.getByRole('button', { name: 'Mark not suitable' }).click();
    await expect(page.getByText(/marked not suitable/).first()).toBeVisible({ timeout: 15_000 });

    // ── Activity lists the work with times.
    await page.goto(`/campaigns/${cid}?tab=activity`);
    const activity = page.getByTestId('campaign-activity-rows');
    await expect(activity).toContainText(/Converted to candidate/, { timeout: 15_000 });
    await expect(activity).toContainText(/Campaign draft → active/);
    await expect(activity.locator('li').first()).toContainText(/\d{2}:\d{2}/);

    // ── Prospect page with history.
    const [annProspect] = await m.db
      .select({ id: m.s.recruitmentProspects.id })
      .from(m.s.recruitmentProspects)
      .where(m.eq(m.s.recruitmentProspects.personId, ids.annId));
    await page.goto(`/prospects/${annProspect?.id}`);
    await expect(page.getByTestId('prospect-history')).toContainText(/Status: new → screened/, {
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Open candidate' }).first()).toBeVisible();

    // ── Navigation: job and employer links.
    await page.goto(`/campaigns/${cid}`);
    await expect(page.getByTestId('campaign-job-link')).toHaveAttribute(
      'href',
      `/requisitions/${ids.jobId}`,
    );
    await expect(page.getByTestId('campaign-employer-link')).toHaveAttribute(
      'href',
      `/employers/${ids.employerId}`,
    );

    // ── Complete: the open ad is closed; then archive → read only.
    await page.getByRole('button', { name: /^Complete$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Complete campaign' }).click();
    await expect(page.getByText('Campaign completed').first()).toBeVisible({ timeout: 15_000 });
    const adsAfter = await m.db
      .select({ status: m.s.advertisements.status })
      .from(m.s.advertisements)
      .where(m.eq(m.s.advertisements.campaignId, cid));
    expect(adsAfter.every((a) => a.status === 'CLOSED')).toBe(true);
    await page.getByRole('button', { name: /^Archive$/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#cm-archive-reason').fill('Intake finished');
    await dialog.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Campaign archived').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('campaign-archived')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Record prospect/ })).toHaveCount(0);
  } finally {
    await cleanup(m, stamp, ids);
  }
});

test('R4: "Start a campaign" from a job pre-selects it; workspace fits a phone', async ({
  page,
}) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.goto(`/campaigns?requisitionId=${ids.jobId}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('New recruitment campaign')).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByTestId('campaign-selected-job')).toContainText(
      `R4 Care Assistant ${stamp}`,
      { timeout: 15_000 },
    );
    await expect(dialog.getByTestId('campaign-employer-readonly')).toHaveText(
      `R4 Care Homes ${stamp}`,
    );
    await dialog.locator('#cm-name').fill(`R4 Phone ${stamp}`);
    await dialog.getByRole('button', { name: /^Create campaign$/ }).click();
    await expect(page.getByText('Campaign created').first()).toBeVisible({ timeout: 15_000 });
    const [c] = await m.db
      .select({ id: m.s.recruitmentCampaigns.id })
      .from(m.s.recruitmentCampaigns)
      .where(m.eq(m.s.recruitmentCampaigns.name, `R4 Phone ${stamp}`));

    // A malformed link is a missing page, not a server error.
    for (const bad of ['/campaigns/not-a-campaign', '/prospects/not-a-prospect']) {
      const res = await page.goto(bad);
      expect(res?.status(), bad).toBe(404);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of [
      `/campaigns/${c?.id}`,
      `/campaigns/${c?.id}?tab=ads`,
      '/campaigns',
      '/prospects',
    ]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, url).toBeLessThanOrEqual(1);
    }
  } finally {
    await cleanup(m, stamp, ids);
  }
});

test('R4: pause suspends ads and blocks capture; existing prospects continue; resume + manual ad reactivation', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    const [c] = await m.db
      .insert(m.s.recruitmentCampaigns)
      .values({
        name: `R4 Pause ${stamp}`,
        jobRequisitionId: ids.jobId,
        status: 'ACTIVE',
        startedAt: new Date(),
      })
      .returning({ id: m.s.recruitmentCampaigns.id });
    const [ad] = await m.db
      .insert(m.s.advertisements)
      .values({
        campaignId: c?.id ?? '',
        country: 'Ireland',
        platform: 'IrishJobs',
        targetApplicants: 5,
        startDate: '2026-11-01',
        expiryDate: '2026-12-15',
        status: 'ACTIVE',
      })
      .returning({ id: m.s.advertisements.id });
    await m.db
      .insert(m.s.recruitmentProspects)
      .values({ personId: ids.annId, advertisementId: ad?.id ?? '', status: 'NEW' });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/campaigns/${c?.id}`);
    await expect(page.getByRole('heading', { name: `R4 Pause ${stamp}` })).toBeVisible({
      timeout: 20_000,
    });

    // ── Pause: ad suspended, capture blocked, existing prospect still workable.
    await page.getByRole('button', { name: /^Pause$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Pause campaign' }).click();
    await expect(page.getByText('Campaign paused').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('prospects-paused')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByTestId('campaign-prospects').getByRole('button', { name: 'Record prospect' }),
    ).toHaveCount(0);
    const row = page
      .getByTestId('prospect-rows')
      .locator('li')
      .filter({ hasText: `Ann${stamp}` });
    await row.locator('summary').click();
    await row.getByRole('button', { name: 'Mark screened' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark screened' }).click();
    await expect(page.getByText(/marked screened/).first()).toBeVisible({ timeout: 15_000 });

    await page.goto(`/campaigns/${c?.id}?tab=ads`);
    await expect(page.getByTestId('ad-rows')).toContainText('Paused', { timeout: 15_000 });
    // While paused, "Running" is not offered for the ad.
    await page.getByRole('button', { name: /Edit advertisement Ireland/ }).click();
    await expect(page.getByRole('dialog').locator('#ad-status option[value="ACTIVE"]')).toHaveCount(
      0,
    );
    await page.keyboard.press('Escape');

    // ── Resume: campaign active, ad still paused until reactivated by hand.
    await page.getByRole('button', { name: /^Resume$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resume campaign' }).click();
    await expect(page.getByText('Campaign resumed').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ad-rows')).toContainText('Paused');
    await page.getByRole('button', { name: /Edit advertisement Ireland/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#ad-status').selectOption('ACTIVE');
    await dialog.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Advertisement updated').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ad-rows')).toContainText('Marked live');

    await page.goto(`/campaigns/${c?.id}?tab=activity`);
    const activity = page.getByTestId('campaign-activity-rows');
    await expect(activity).toContainText(/Campaign active → paused/, { timeout: 15_000 });
    await expect(activity).toContainText(/Campaign paused → active/);
    await expect(activity).toContainText(/Advertisement active → paused/);
  } finally {
    await cleanup(m, stamp, ids);
  }
});
