import { expect, type Page, test } from '@playwright/test';

/**
 * R6 — one person through every Recruitment module, using the real screens:
 *   Campaign prospect (R4) → screened → converted to Candidate + shortlisted
 *   on the campaign's job → Pipeline: promoted to Applied (R2) →
 *   Interview scheduled and passed (R3) → Offer created, sent, accepted →
 *   Placed through R0's guarded action → the seat shows on Seats.
 * Only seed data is inserted directly; one test-only step moves the
 * scheduled interview into the past so its result can be recorded.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  const campaigns = await import('../src/lib/db/schema/campaigns');
  const io = await import('../src/lib/db/schema/interviews_offers');
  return {
    db,
    and,
    eq,
    inArray,
    sql,
    s: { ...recruitment, ...personsSchema, ...campaigns, ...io },
  };
}

async function expandRow(page: Page, testId: string, text: RegExp) {
  const row = page.getByTestId(testId).locator('li').filter({ hasText: text }).first();
  const open = await row.locator('details').evaluate((d) => (d as HTMLDetailsElement).open);
  if (!open) await row.locator('summary').click();
  return row;
}

test('Campaign prospect → Candidate → Shortlist → Interview → Offer → Placement', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const name = `Journey${stamp}`;

  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ legalName: `Journey Care ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('seed failed');
  const [job] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      employerId: emp.id,
      title: `Journey HCA ${stamp}`,
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!job) throw new Error('seed failed');
  const [campaign] = await m.db
    .insert(m.s.recruitmentCampaigns)
    .values({
      name: `Journey campaign ${stamp}`,
      jobRequisitionId: job.id,
      status: 'ACTIVE',
      startedAt: new Date(),
    })
    .returning({ id: m.s.recruitmentCampaigns.id });
  if (!campaign) throw new Error('seed failed');
  const [ad] = await m.db
    .insert(m.s.advertisements)
    .values({
      campaignId: campaign.id,
      country: 'Ireland',
      platform: 'IrishJobs',
      targetApplicants: 5,
      startDate: '2026-10-01',
      expiryDate: '2026-12-31',
      status: 'ACTIVE',
    })
    .returning({ id: m.s.advertisements.id });
  const [person] = await m.db
    .insert(m.s.persons)
    .values({
      firstName: name,
      lastName: 'Rsix',
      email: `journey-${stamp}@example.test`,
      source: 'ADVERTISEMENT',
    })
    .returning({ id: m.s.persons.id });
  if (!ad || !person) throw new Error('seed failed');

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── 1. Prospect from the campaign's advertisement.
    await page.goto(`/campaigns/${campaign.id}`);
    const prospects = page.getByTestId('campaign-prospects');
    await expect(prospects).toBeVisible({ timeout: 20_000 });
    await prospects.getByRole('button', { name: 'Record prospect' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('#pr-search').fill(name);
    await dialog
      .getByTestId('prospect-person-results')
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await dialog.getByRole('button', { name: /^Record prospect$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 });

    // ── 2. Screen, then convert to candidate + shortlist on the job.
    let row = await expandRow(page, 'prospect-rows', new RegExp(name));
    await row.getByRole('button', { name: 'Mark screened' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark screened' }).click();
    await expect(page.getByText(/marked screened/).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Ready to convert/ }).click();
    row = await expandRow(page, 'prospect-rows', new RegExp(name));
    await row.getByRole('button', { name: /Convert to candidate/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByText(/Also add to the shortlist/).click();
    await dialog.getByText(/has been screened and should become a candidate/).click();
    await dialog.getByRole('button', { name: 'Convert to candidate' }).click();
    await expect(page.getByText(/converted to candidate/).first()).toBeVisible({ timeout: 15_000 });

    // ── 3. Pipeline: the shortlisted candidate is promoted to Applied.
    await page.goto(`/requisitions/${job.id}`);
    const card = page.locator('article', { hasText: name });
    await card.getByRole('button', { name: /promote to applied/i }).click();
    await expect(page.getByText(/promoted to applied/i).first()).toBeVisible({ timeout: 15_000 });
    const appRow = async () =>
      (
        await m.db
          .select()
          .from(m.s.jobApplications)
          .where(
            m.and(
              m.eq(m.s.jobApplications.jobRequisitionId, job.id),
              m.eq(m.s.jobApplications.personId, person.id),
            ),
          )
      )[0];
    await expect.poll(async () => (await appRow())?.status, { timeout: 15_000 }).toBe('APPLIED');
    const applicationId = (await appRow())?.id ?? '';

    // ── 4. Interview: scheduled through R3 (moves the application to Interview).
    await page.goto(`/requisitions/${job.id}?tab=interviews`);
    const io = page.getByTestId('interviews-offers');
    await expect(io).toBeVisible({ timeout: 20_000 });
    await io.getByRole('button', { name: /Schedule interview/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#iv-candidate').selectOption(applicationId);
    const when = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await dialog.locator('#iv-when').fill(`${when}T11:00`);
    await dialog.locator('#iv-location').fill('https://meet.example.test/journey');
    await dialog.getByRole('button', { name: /^Schedule interview$/ }).click();
    await expect(page.getByText('Interview scheduled').first()).toBeVisible({ timeout: 15_000 });
    expect((await appRow())?.status).toBe('INTERVIEW');
    // Test-only: the interview "has happened" so its result can be recorded.
    await m.db
      .update(m.s.interviews)
      .set({ scheduledAt: new Date(Date.now() - 3_600_000) })
      .where(m.eq(m.s.interviews.jobApplicationId, applicationId));

    await page.goto(`/requisitions/${job.id}?tab=interviews`);
    await io.getByRole('button', { name: /Needs result/ }).click();
    row = await expandRow(page, 'interview-rows', new RegExp(name));
    await row.getByRole('button', { name: 'Record result' }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#iv-outcome').selectOption('PASS');
    await dialog.locator('#iv-feedback').fill('Warm, safe practice, ready to start.');
    await dialog.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Interview result recorded').first()).toBeVisible({
      timeout: 15_000,
    });

    // ── 5. Offer → sent → accepted.
    await io.getByRole('button', { name: /^Completed/ }).click();
    row = await expandRow(page, 'interview-rows', new RegExp(name));
    await row.getByRole('button', { name: /Create offer/ }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('#of-amount').fill('36000');
    await dialog.getByRole('button', { name: /Create draft offer/ }).click();
    await expect(page.getByText('Draft offer created').first()).toBeVisible({ timeout: 15_000 });
    let offer = await expandRow(page, 'offer-rows', new RegExp(name));
    await offer.getByRole('button', { name: 'Record as sent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Record as sent' }).click();
    await expect(page.getByText('Offer recorded as sent').first()).toBeVisible({ timeout: 15_000 });
    offer = await expandRow(page, 'offer-rows', new RegExp(name));
    await offer.getByRole('button', { name: 'Record acceptance' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Record acceptance' }).click();
    await expect(page.getByText('Acceptance recorded').first()).toBeVisible({ timeout: 15_000 });

    // ── 6. Placement through R0's guarded action (standard accepted-offer path).
    await io.getByRole('button', { name: /^Accepted/ }).click();
    offer = await expandRow(page, 'offer-rows', new RegExp(name));
    await offer.getByRole('button', { name: 'Place candidate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Place candidate' }).click();
    await expect(page.getByText(new RegExp(`${name} Rsix placed`)).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/requisitions/${job.id}?tab=seats`);
    await expect(
      page.getByTestId('seat-rows').locator('[data-seat-kind="filled"]').filter({ hasText: name }),
    ).toBeVisible({ timeout: 15_000 });

    // ── DB truth across modules.
    const [prospect] = await m.db
      .select({ status: m.s.recruitmentProspects.status })
      .from(m.s.recruitmentProspects)
      .where(m.eq(m.s.recruitmentProspects.personId, person.id));
    expect(prospect?.status).toBe('CONVERTED_TO_CANDIDATE');
    expect((await appRow())?.status).toBe('ACCEPTED');
    const [placement] = await m.db
      .select({ status: m.s.placements.status })
      .from(m.s.placements)
      .where(m.eq(m.s.placements.personId, person.id));
    expect(placement?.status).toBe('CONFIRMED');
    const [jobAfter] = await m.db
      .select({ filled: m.s.jobRequisitions.positionsFilled, status: m.s.jobRequisitions.status })
      .from(m.s.jobRequisitions)
      .where(m.eq(m.s.jobRequisitions.id, job.id));
    expect(jobAfter).toEqual({ filled: 1, status: 'FILLED' });
  } finally {
    const apps = await m.db
      .select({ id: m.s.jobApplications.id })
      .from(m.s.jobApplications)
      .where(m.eq(m.s.jobApplications.jobRequisitionId, job.id));
    const appIds = apps.map((a) => a.id);
    const list = (ids: string[]) =>
      ids.length
        ? m.sql.join(
            ids.map((i) => m.sql`${i}`),
            m.sql`, `,
          )
        : m.sql`NULL`;
    await m.db.execute(m.sql`DELETE FROM audit_events WHERE entity_id IN (
      SELECT id::text FROM interviews WHERE job_application_id IN (${list(appIds)})
      UNION SELECT id::text FROM offers WHERE job_application_id IN (${list(appIds)})
      UNION SELECT id::text FROM placements WHERE job_requisition_id = ${job.id}
      UNION SELECT id::text FROM shortlist_entries WHERE job_requisition_id = ${job.id}
      UNION SELECT id::text FROM candidate_matches WHERE job_requisition_id = ${job.id}
      UNION SELECT id::text FROM recruitment_prospects WHERE person_id = ${person.id}
      UNION SELECT id::text FROM candidate_profiles WHERE person_id = ${person.id})
      OR entity_id IN (${list([...appIds, job.id, emp.id, campaign.id, ad.id, person.id])})
      OR (entity_type = 'shortlist_entry' AND (before->>'jobRequisitionId' = ${job.id} OR after->>'jobRequisitionId' = ${job.id}))`);
    if (appIds.length) {
      await m.db.delete(m.s.offers).where(m.inArray(m.s.offers.jobApplicationId, appIds));
      await m.db.delete(m.s.interviews).where(m.inArray(m.s.interviews.jobApplicationId, appIds));
    }
    await m.db.delete(m.s.placements).where(m.eq(m.s.placements.jobRequisitionId, job.id));
    await m.db
      .delete(m.s.jobApplications)
      .where(m.eq(m.s.jobApplications.jobRequisitionId, job.id));
    await m.db
      .delete(m.s.shortlistEntries)
      .where(m.eq(m.s.shortlistEntries.jobRequisitionId, job.id));
    await m.db
      .delete(m.s.candidateMatches)
      .where(m.eq(m.s.candidateMatches.jobRequisitionId, job.id));
    await m.db
      .delete(m.s.recruitmentProspects)
      .where(m.eq(m.s.recruitmentProspects.personId, person.id));
    await m.db.delete(m.s.advertisements).where(m.eq(m.s.advertisements.id, ad.id));
    await m.db
      .delete(m.s.recruitmentCampaigns)
      .where(m.eq(m.s.recruitmentCampaigns.id, campaign.id));
    await m.db.delete(m.s.candidateProfiles).where(m.eq(m.s.candidateProfiles.personId, person.id));
    await m.db.delete(m.s.persons).where(m.eq(m.s.persons.id, person.id));
    await m.db.delete(m.s.jobRequisitions).where(m.eq(m.s.jobRequisitions.id, job.id));
    await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, emp.id));
  }
});
