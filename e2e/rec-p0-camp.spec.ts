import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * P0 — campaigns & job integrity (owner decision 7), as a recruiter:
 *   1. creates a talent-pool campaign — no employer or job fields at all —
 *      and lands on the new campaign (prospects explained as unavailable
 *      while it is a draft);
 *   2. creates a job campaign for "Healthcare Assistant": the employer
 *      appears automatically and read-only; there is no employer picker; a
 *      filled job is not offered; Create stays disabled until a job is
 *      picked; lands on the campaign, which shows the job's employer;
 *   3. reopening "New campaign" is blank;
 *   4. editing that job shows its employer read-only (it has a campaign).
 * Screenshots (1440 + 390) go to playwright/stage-rec-p0-camp-screenshots
 * (git-ignored, repo convention;
 * the folder is created here so the spec runs on any machine, including CI).
 */

const SHOTS = path.resolve('playwright/stage-rec-p0-camp-screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray, like } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const campaigns = await import('../src/lib/db/schema/campaigns');
  const audit = await import('../src/lib/db/schema/audit_events');
  return { db, eq, inArray, like, s: { ...recruitment, ...campaigns, ...audit } };
}
type M = Awaited<ReturnType<typeof dbModules>>;

async function seed(m: M, stamp: string) {
  const owner = await e2eAdminId();
  const [sunrise, bayview] = await m.db
    .insert(m.s.employers)
    .values([
      { assignedUserId: owner, legalName: `P0 Sunrise Care ${stamp}` },
      { assignedUserId: owner, legalName: `P0 Bayview Nursing ${stamp}` },
    ])
    .returning({ id: m.s.employers.id });
  if (!sunrise || !bayview) throw new Error('seed failed');
  const job = (employerId: string, title: string, status: 'OPEN' | 'FILLED') => ({
    assignedUserId: owner,
    employerId,
    title,
    positionsRequired: 3,
    employmentType: 'FULL_TIME' as const,
    status,
  });
  const [ha, other, filled] = await m.db
    .insert(m.s.jobRequisitions)
    .values([
      job(sunrise.id, `Healthcare Assistant ${stamp}`, 'OPEN'),
      job(bayview.id, `Healthcare Assistant ${stamp}`, 'OPEN'),
      job(sunrise.id, `Healthcare Assistant ${stamp} (filled)`, 'FILLED'),
    ])
    .returning({ id: m.s.jobRequisitions.id });
  if (!ha || !other || !filled) throw new Error('seed failed');
  return {
    sunriseId: sunrise.id,
    bayviewId: bayview.id,
    jobId: ha.id,
    otherJobId: other.id,
    filledJobId: filled.id,
  };
}

async function cleanup(m: M, stamp: string, ids: Awaited<ReturnType<typeof seed>>) {
  const camps = await m.db
    .select({ id: m.s.recruitmentCampaigns.id })
    .from(m.s.recruitmentCampaigns)
    .where(m.like(m.s.recruitmentCampaigns.name, `%${stamp}%`));
  const campIds = camps.map((c) => c.id);
  const jobIds = [ids.jobId, ids.otherJobId, ids.filledJobId];
  await m.db
    .delete(m.s.auditEvents)
    .where(m.inArray(m.s.auditEvents.entityId, [...campIds, ...jobIds]));
  if (campIds.length) {
    await m.db
      .delete(m.s.recruitmentCampaigns)
      .where(m.inArray(m.s.recruitmentCampaigns.id, campIds));
  }
  await m.db.delete(m.s.jobRequisitions).where(m.inArray(m.s.jobRequisitions.id, jobIds));
  await m.db
    .delete(m.s.employers)
    .where(m.inArray(m.s.employers.id, [ids.sunriseId, ids.bayviewId]));
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test('Recruiter creates a talent pool and a job campaign; employer comes from the job and is locked', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const ids = await seed(m, stamp);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── 1. Talent pool: no employer / job fields anywhere.
    await page.goto('/campaigns');
    await page.getByRole('button', { name: /New campaign/ }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Talent pool' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByText('Employer', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByText(/Talent pool \(no job\)/)).toHaveCount(0);
    await shot(page, 'desktop-new-campaign-talent-pool');
    await dialog.getByLabel(/^Name/).fill(`P0 Kerala pool ${stamp}`);
    await dialog.getByRole('button', { name: /^Create campaign$/ }).click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: `P0 Kerala pool ${stamp}` })).toBeVisible({
      timeout: 20_000,
    });
    // Draft: why prospects can't be recorded yet.
    await expect(page.getByTestId('prospects-unavailable')).toContainText(/still a draft/);
    await expect(page.getByRole('button', { name: 'Record prospect' })).toHaveCount(0);

    // ── 2. Job campaign: employer derived and read-only.
    await page.goto('/campaigns');
    await page.getByRole('button', { name: /New campaign/ }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/^Name/)).toHaveValue('');
    await dialog.getByLabel(/^Name/).fill(`P0 Spring HCA ${stamp}`);
    await dialog.getByRole('button', { name: 'For a job' }).click();
    const create = dialog.getByRole('button', { name: /^Create campaign$/ });
    await expect(create).toBeDisabled();
    await dialog.getByLabel(/^Job/).fill(`Healthcare Assistant ${stamp}`);
    const results = dialog.getByTestId('campaign-job-results');
    // Same title at two employers: each row names its employer. Filled job not offered.
    await expect(results.getByRole('button')).toHaveCount(2, { timeout: 15_000 });
    await expect(results).toContainText(`P0 Sunrise Care ${stamp} · Open`);
    await expect(results).toContainText(`P0 Bayview Nursing ${stamp} · Open`);
    await expect(results).not.toContainText('(filled)');
    await shot(page, 'desktop-new-campaign-job-picker');
    await results
      .getByRole('button')
      .filter({ hasText: `P0 Sunrise Care ${stamp}` })
      .click();
    await expect(dialog.getByTestId('campaign-selected-job')).toContainText(
      `Healthcare Assistant ${stamp}`,
    );
    const employer = dialog.getByTestId('campaign-employer-readonly');
    await expect(employer).toHaveText(`P0 Sunrise Care ${stamp}`);
    // No control to choose an employer separately.
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByRole('textbox', { name: /employer/i })).toHaveCount(0);
    await shot(page, 'desktop-new-campaign-job-selected');
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: `P0 Spring HCA ${stamp}` })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('campaign-employer-link')).toHaveText(`P0 Sunrise Care ${stamp}`);
    await expect(page.getByTestId('campaign-employer-link')).toHaveAttribute(
      'href',
      `/employers/${ids.sunriseId}`,
    );
    const [saved] = await m.db
      .select()
      .from(m.s.recruitmentCampaigns)
      .where(m.eq(m.s.recruitmentCampaigns.name, `P0 Spring HCA ${stamp}`));
    expect(saved?.jobRequisitionId).toBe(ids.jobId);
    expect(saved?.status).toBe('DRAFT');
    await shot(page, 'desktop-campaign-workspace');

    // ── 3. Reopening "New campaign" is blank.
    await page.goto('/campaigns');
    await page.getByRole('button', { name: /New campaign/ }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/^Name/)).toHaveValue('');
    await expect(dialog.getByRole('button', { name: 'Talent pool' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await dialog.getByRole('button', { name: 'For a job' }).click();
    await expect(dialog.getByTestId('campaign-selected-job')).toHaveCount(0);
    await expect(dialog.getByLabel(/^Job/)).toHaveValue('');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ── 4. Editing the job: its employer is read-only now it has a campaign.
    await page.goto(`/requisitions/${ids.jobId}`);
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    dialog = page.getByRole('dialog');
    const locked = dialog.getByTestId('requisition-employer-readonly');
    await expect(locked).toContainText(`P0 Sunrise Care ${stamp}`);
    await expect(dialog.getByText(/already has activity for this employer/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      dialog.getByRole('button', { name: /Search employers|Choose employer/i }),
    ).toHaveCount(0);
    await shot(page, 'desktop-requisition-edit-employer-locked');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // ── Phone width: the two dialog states fit.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/campaigns');
    await page.getByRole('button', { name: /New campaign/ }).click();
    dialog = page.getByRole('dialog');
    await shot(page, 'phone-new-campaign-talent-pool');
    await dialog.getByRole('button', { name: 'For a job' }).click();
    await dialog.getByLabel(/^Job/).fill(`Healthcare Assistant ${stamp}`);
    await expect(dialog.getByTestId('campaign-job-results').getByRole('button')).toHaveCount(2, {
      timeout: 15_000,
    });
    await shot(page, 'phone-new-campaign-job-picker');
    await dialog
      .getByTestId('campaign-job-results')
      .getByRole('button')
      .filter({ hasText: `P0 Sunrise Care ${stamp}` })
      .click();
    await expect(dialog.getByTestId('campaign-employer-readonly')).toHaveText(
      `P0 Sunrise Care ${stamp}`,
    );
    await shot(page, 'phone-new-campaign-job-selected');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await cleanup(m, stamp, ids);
  }
});
