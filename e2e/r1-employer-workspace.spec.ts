import { expect, test } from '@playwright/test';

/**
 * R1 — Employer Workspace, browser-level proof:
 *   1. The workspace renders the CS-style hero + truthful KPI strip and
 *      the tabbed layout; `?tab=` deep links land on the right tab.
 *   2. Job requirements rows show "X of Y placed · Z remaining" from the
 *      R0-corrected counters, with per-row next steps.
 *   3. Contacts can be added AND deleted (new in R1), with the deletion
 *      audited (full before-snapshot) — verified in the DB.
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const users = await import('../src/lib/db/schema/users');
  return { db, eq, sql, schemas: { ...recruitment, ...users } };
}

test('employer workspace: hero, KPIs, tabs, requirement rows', async ({ page }) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [admin] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  const [emp] = await m.db
    .insert(m.schemas.employers)
    .values({ legalName: `R1 Workspace Ltd ${stamp}`, industry: 'Healthcare', city: 'Cork' })
    .returning({ id: m.schemas.employers.id });
  if (!emp || !admin) throw new Error('seed failed');
  const reqIds: string[] = [];
  for (const [title, positions] of [
    [`R1 Nurses ${stamp}`, 3],
    [`R1 Carers ${stamp}`, 2],
  ] as const) {
    const [r] = await m.db
      .insert(m.schemas.jobRequisitions)
      .values({
        employerId: emp.id,
        title,
        positionsRequired: positions,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
        assignedUserId: admin.id,
      })
      .returning({ id: m.schemas.jobRequisitions.id });
    if (!r) throw new Error('req seed failed');
    reqIds.push(r.id);
  }
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/employers/${emp.id}`);
    await expect(page.getByRole('heading', { name: `R1 Workspace Ltd ${stamp}` })).toBeVisible({
      timeout: 20_000,
    });

    // KPI strip — 2 active requirements, 5 positions, 0 placed, 5 remaining.
    await expect(
      page.getByTestId('kpi-Active requirements').getByText('2', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId('kpi-Positions required').getByText('5', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId('kpi-Confirmed placed').getByText('0', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('kpi-Remaining').getByText('5', { exact: true })).toBeVisible();

    // Deep link to Billing & VAT.
    await page.goto(`/employers/${emp.id}?tab=billing`);
    await expect(page.getByText('Billing & VAT settings')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('VAT treatment')).toBeVisible();

    // Requirements tab rows carry the corrected counter language.
    await page.getByRole('tab', { name: 'Job requirements' }).click();
    await expect(page).toHaveURL(/tab=requirements/);
    await expect(page.getByText('0 of 3 placed · 3 remaining')).toBeVisible();
    await expect(page.getByText('0 of 2 placed · 2 remaining')).toBeVisible();
  } finally {
    for (const id of reqIds) {
      await m.db.delete(m.schemas.jobRequisitions).where(m.eq(m.schemas.jobRequisitions.id, id));
    }
    await m.db.delete(m.schemas.employers).where(m.eq(m.schemas.employers.id, emp.id));
  }
});

test('contacts: add then delete, with the deletion audited', async ({ page }) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [emp] = await m.db
    .insert(m.schemas.employers)
    .values({ legalName: `R1 Contacts Ltd ${stamp}` })
    .returning({ id: m.schemas.employers.id });
  if (!emp) throw new Error('seed failed');
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/employers/${emp.id}?tab=contacts`);
    await page.getByRole('button', { name: /Add contact/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/full name/i).fill(`Mary Hiring ${stamp}`);
    await dialog
      .getByRole('button', { name: /save|add/i })
      .last()
      .click();
    await expect(page.getByText(`Mary Hiring ${stamp}`).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: `Delete Mary Hiring ${stamp}` }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Delete contact$/ })
      .click();
    await expect(page.getByText(/removed/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Mary Hiring ${stamp}`)).toHaveCount(0);

    const [audit] = await m.db.execute<{ n: string }>(m.sql`
      SELECT COUNT(*)::text AS n FROM audit_events
      WHERE entity_type = 'employer_contact' AND action = 'DELETED'
        AND "before" ->> 'fullName' = ${`Mary Hiring ${stamp}`}
    `);
    expect(Number(audit?.n ?? 0)).toBe(1);
  } finally {
    const contacts = await m.db
      .select({ id: m.schemas.employerContacts.id })
      .from(m.schemas.employerContacts)
      .where(m.eq(m.schemas.employerContacts.employerId, emp.id));
    for (const c of contacts) {
      await m.db
        .delete(m.schemas.employerContacts)
        .where(m.eq(m.schemas.employerContacts.id, c.id));
    }
    await m.db.delete(m.schemas.employers).where(m.eq(m.schemas.employers.id, emp.id));
  }
});
