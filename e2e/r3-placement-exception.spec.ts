import { expect, test } from '@playwright/test';

/**
 * R3 decision 6 — placing a candidate with no offer accepted in the CRM
 * (external recruitment hires) asks for a confirmation and an audited
 * reason instead of placing silently. Covers the pipeline "Mark placed"
 * card action and the Placements table "Confirm". The
 * standard accepted-offer path is covered in r3-interviews-offers.spec.ts.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { and, eq, inArray, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const personsSchema = await import('../src/lib/db/schema/persons');
  const audit = await import('../src/lib/db/schema/audit_events');
  return { db, and, eq, inArray, sql, s: { ...recruitment, ...personsSchema, ...audit } };
}

test('placing without an accepted offer needs confirmation + reason, and is audited', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [emp] = await m.db
    .insert(m.s.employers)
    .values({ legalName: `R3 Exception Care ${stamp}` })
    .returning({ id: m.s.employers.id });
  if (!emp) throw new Error('seed failed');
  const [req] = await m.db
    .insert(m.s.jobRequisitions)
    .values({
      employerId: emp.id,
      title: `R3 Exception Job ${stamp}`,
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning({ id: m.s.jobRequisitions.id });
  if (!req) throw new Error('seed failed');
  const [ann, ben] = await m.db
    .insert(m.s.persons)
    .values([
      { firstName: `Ann${stamp}`, lastName: 'Rexcept', source: 'DIRECT' as const },
      { firstName: `Ben${stamp}`, lastName: 'Rexcept', source: 'DIRECT' as const },
    ])
    .returning({ id: m.s.persons.id });
  if (!ann || !ben) throw new Error('seed failed');
  const [annApp, benApp] = await m.db
    .insert(m.s.jobApplications)
    .values([
      { personId: ann.id, jobRequisitionId: req.id, status: 'OFFER' as const },
      { personId: ben.id, jobRequisitionId: req.id, status: 'ACCEPTED' as const },
    ])
    .returning({ id: m.s.jobApplications.id });
  if (!annApp || !benApp) throw new Error('seed failed');
  const [benProposed] = await m.db
    .insert(m.s.placements)
    .values({
      personId: ben.id,
      employerId: emp.id,
      jobRequisitionId: req.id,
      jobApplicationId: benApp.id,
      status: 'PROPOSED',
    })
    .returning({ id: m.s.placements.id });
  if (!benProposed) throw new Error('seed failed');

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── Pipeline: Ann is at Offer with no CRM offer.
    await page.goto(`/requisitions/${req.id}`);
    const card = page.locator('article', { hasText: `Ann${stamp}` });
    await card.getByRole('button', { name: /accept offer|mark placed/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/without an accepted offer/i)).toBeVisible({ timeout: 15_000 });
    // Nothing was placed by the first click.
    const none = await m.db
      .select()
      .from(m.s.placements)
      .where(m.eq(m.s.placements.personId, ann.id));
    expect(none).toHaveLength(0);

    // Confirmation is required before the button works.
    const submit = dialog.getByRole('button', { name: 'Place without offer' });
    await expect(submit).toBeDisabled();
    await dialog.getByRole('checkbox').click();
    await dialog.locator('#pe-reason').fill('ab');
    await submit.click();
    await expect(dialog.getByText(/at least 5 characters/)).toBeVisible({ timeout: 10_000 });

    await dialog.locator('#pe-reason').fill('Hired through the employer’s own agency');
    await submit.click();
    await expect(page.getByText(new RegExp(`Ann${stamp} Rexcept placed`)).first()).toBeVisible({
      timeout: 15_000,
    });

    const [annPlacement] = await m.db
      .select()
      .from(m.s.placements)
      .where(m.eq(m.s.placements.personId, ann.id));
    expect(annPlacement?.status).toBe('CONFIRMED');
    const [audit] = await m.db
      .select()
      .from(m.s.auditEvents)
      .where(
        m.and(
          m.eq(m.s.auditEvents.entityId, annPlacement?.id ?? ''),
          m.eq(m.s.auditEvents.action, 'PLACED_WITHOUT_ACCEPTED_OFFER'),
        ),
      );
    expect(audit?.after).toMatchObject({
      reason: 'Hired through the employer’s own agency',
      confirmed: true,
    });

    // The exception reads clearly in the job's Activity tab, with a time.
    await page.goto(`/requisitions/${req.id}?tab=activity`);
    const activity = page.getByTestId('activity-rows');
    const line = activity
      .locator('li')
      .filter({ hasText: /Placed without an accepted offer — reason: Hired through/ });
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toContainText(/\d{2}:\d{2}/);

    // ── Placements table: confirming Ben's proposed placement asks too.
    await page.goto('/placements');
    const row = page.locator('tr', { hasText: `Ben${stamp}` }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /^Confirm/ }).click();
    await expect(dialog.getByText(/without an accepted offer/i)).toBeVisible({ timeout: 15_000 });
    await dialog.locator('#pe-reason').fill('Placed via partner agency, offer held by employer');
    await dialog.getByRole('checkbox').click();
    await dialog.getByRole('button', { name: 'Place without offer' }).click();
    await expect(page.getByText('Placement moved to CONFIRMED').first()).toBeVisible({
      timeout: 15_000,
    });
    const [benAfter] = await m.db
      .select({ status: m.s.placements.status })
      .from(m.s.placements)
      .where(m.eq(m.s.placements.id, benProposed.id));
    expect(benAfter?.status).toBe('CONFIRMED');
  } finally {
    const pl = await m.db
      .select({ id: m.s.placements.id })
      .from(m.s.placements)
      .where(m.eq(m.s.placements.jobRequisitionId, req.id));
    const entityIds = [req.id, annApp.id, benApp.id, ...pl.map((p) => p.id)];
    await m.db.delete(m.s.auditEvents).where(m.inArray(m.s.auditEvents.entityId, entityIds));
    await m.db.execute(
      m.sql`DELETE FROM audit_events WHERE entity_id IN (SELECT id::text FROM candidate_profiles WHERE person_id IN (${ann.id}, ${ben.id}))`,
    );
    await m.db.delete(m.s.placements).where(m.eq(m.s.placements.jobRequisitionId, req.id));
    await m.db
      .delete(m.s.jobApplications)
      .where(m.eq(m.s.jobApplications.jobRequisitionId, req.id));
    await m.db.delete(m.s.jobRequisitions).where(m.eq(m.s.jobRequisitions.id, req.id));
    await m.db.delete(m.s.persons).where(m.inArray(m.s.persons.id, [ann.id, ben.id]));
    await m.db.delete(m.s.employers).where(m.eq(m.s.employers.id, emp.id));
  }
});
