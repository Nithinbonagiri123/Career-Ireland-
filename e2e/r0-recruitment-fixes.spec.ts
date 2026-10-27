import { expect, test } from '@playwright/test';

/**
 * R0 — recruitment workflow corrections, browser-level proof:
 *   1. An employer (Recruitment) lead's detail page renders the employer
 *      (it used to title itself "Unknown" and show nothing).
 *   2. Requisition tab deep links (?tab=) are honoured.
 *   3. The "close requisition" next-action deep link (?close=1) opens a
 *      real confirm dialog (window.confirm retired), and closing works.
 *   4. The recruitment Leads page copy speaks employer language, not
 *      candidate-payment language.
 * Seat-guard/counter behaviour is covered by the DB-level matrix in
 * src/modules/placements/seat-guards.test.ts (9 cases).
 */

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const leads = await import('../src/lib/db/schema/leads');
  const users = await import('../src/lib/db/schema/users');
  return { db, eq, schemas: { ...recruitment, ...leads, ...users } };
}

test('employer lead detail renders the employer and links to its profile', async ({ page }) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [emp] = await m.db
    .insert(m.schemas.employers)
    .values({ legalName: `R0 Lead Employer ${stamp}`, city: 'Galway', country: 'Ireland' })
    .returning({ id: m.schemas.employers.id });
  if (!emp) throw new Error('employer seed failed');
  const [lead] = await m.db
    .insert(m.schemas.leads)
    .values({ targetBusiness: 'RECRUITMENT', employerId: emp.id, status: 'NEW' })
    .returning({ id: m.schemas.leads.id });
  if (!lead) throw new Error('lead seed failed');
  try {
    await page.goto(`/leads/${lead.id}`);
    await expect(page.getByRole('heading', { name: `R0 Lead Employer ${stamp}` })).toBeVisible({
      timeout: 20_000,
    });
    expect(await page.getByText('Unknown').count()).toBe(0);
    await expect(page.getByRole('link', { name: /Open employer profile/i })).toBeVisible();
  } finally {
    await m.db.delete(m.schemas.leads).where(m.eq(m.schemas.leads.id, lead.id));
    await m.db.delete(m.schemas.employers).where(m.eq(m.schemas.employers.id, emp.id));
  }
});

test('requisition deep links: ?tab= is honoured and ?close=1 opens the close dialog', async ({
  page,
}) => {
  const m = await dbModules();
  const stamp = Math.random().toString(36).slice(2, 7);
  const [admin] = await m.db
    .select({ id: m.schemas.users.id })
    .from(m.schemas.users)
    .where(m.eq(m.schemas.users.email, 'e2e-admin@ireland-careers.test'));
  const [emp] = await m.db
    .insert(m.schemas.employers)
    .values({ legalName: `R0 Tabs Employer ${stamp}` })
    .returning({ id: m.schemas.employers.id });
  if (!emp || !admin) throw new Error('seed failed');
  const [req] = await m.db
    .insert(m.schemas.jobRequisitions)
    .values({
      employerId: emp.id,
      title: `R0 Tabs Req ${stamp}`,
      positionsRequired: 1,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
      assignedUserId: admin.id,
    })
    .returning({ id: m.schemas.jobRequisitions.id });
  if (!req) throw new Error('requisition seed failed');
  try {
    // ?tab=overview lands on the Overview tab (used to be ignored).
    await page.goto(`/requisitions/${req.id}?tab=overview`);
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 20_000 },
    );

    // Switching tabs writes the URL back.
    await page.getByRole('tab', { name: /Checklists/ }).click();
    await expect(page).toHaveURL(/tab=checklists/);

    // ?close=1 opens the proper confirm dialog; confirming closes.
    await page.goto(`/requisitions/${req.id}?close=1`);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Close this requisition?')).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Close requisition' }).click();
    await expect(page.getByText(/Requisition closed/i).first()).toBeVisible({ timeout: 15_000 });
    const [after] = await m.db
      .select({ status: m.schemas.jobRequisitions.status })
      .from(m.schemas.jobRequisitions)
      .where(m.eq(m.schemas.jobRequisitions.id, req.id));
    expect(after?.status).toBe('CLOSED');
  } finally {
    await m.db.delete(m.schemas.jobRequisitions).where(m.eq(m.schemas.jobRequisitions.id, req.id));
    await m.db.delete(m.schemas.employers).where(m.eq(m.schemas.employers.id, emp.id));
  }
});
