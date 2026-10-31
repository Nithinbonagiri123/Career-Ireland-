import { expect, type Page, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Recruitment P0 (W1 finance) — business scenario, admin.
 *
 * An employer enquiry comes in. Finance raises the €1,500 fee from the
 * employer page and records the employer's payment there. Later the
 * recruiter converts the enquiry: the convert dialog offers the paid
 * invoice ("Use an existing invoice"), lists only employer services for a
 * new payment, and defaults payment dates to today (Europe/Dublin).
 * Converting with the existing invoice must leave the employer with ONE
 * invoice, ONE payment and ONE receipt — no double charge.
 *
 * Seeds its own uniquely-named employer + lead and removes only those rows
 * (and the financial rows created for that employer) afterwards.
 */

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const recruitment = await import('../src/lib/db/schema/recruitment');
  const leads = await import('../src/lib/db/schema/leads');
  return { db, eq, sql, schemas: { ...recruitment, ...leads } };
}

function todayInDublin(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Dublin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const STAMP = Math.random().toString(36).slice(2, 7);
const EMPLOYER = `P0FIN-E2E ${STAMP} Hospitality Ltd`;
let employerId = '';
let leadId = '';

async function counts() {
  const m = await dbModules();
  const [r] = await m.db.execute<{ invoices: number; payments: number; receipts: number }>(m.sql`
    SELECT
      (SELECT COUNT(*) FROM invoices WHERE payer_employer_id = ${employerId})::int AS invoices,
      (SELECT COUNT(*) FROM payments p JOIN service_engagements e ON e.id = p.service_engagement_id
        WHERE e.payer_employer_id = ${employerId})::int AS payments,
      (SELECT COUNT(*) FROM receipts r JOIN payments p ON p.id = r.payment_id
        JOIN service_engagements e ON e.id = p.service_engagement_id
        WHERE e.payer_employer_id = ${employerId})::int AS receipts
  `);
  return r;
}

async function openEmployerBilling(page: Page) {
  await page.goto(`/employers/${employerId}?tab=billing`);
  await expect(page.getByRole('heading', { name: EMPLOYER }).first()).toBeVisible({
    timeout: 30_000,
  });
}

test.beforeAll(async () => {
  const m = await dbModules();
  const admin = await e2eAdminId();
  const [emp] = await m.db
    .insert(m.schemas.employers)
    .values({ assignedUserId: admin, legalName: EMPLOYER, relationshipStatus: 'ACTIVE' })
    .returning({ id: m.schemas.employers.id });
  if (!emp) throw new Error('employer seed failed');
  employerId = emp.id;
  // The enquiry arrives first; the fee is raised afterwards.
  const [lead] = await m.db
    .insert(m.schemas.leads)
    .values({
      assignedUserId: admin,
      targetBusiness: 'RECRUITMENT',
      employerId,
      status: 'CONTACTED',
    })
    .returning({ id: m.schemas.leads.id });
  if (!lead) throw new Error('lead seed failed');
  leadId = lead.id;
});

test.afterAll(async () => {
  if (!employerId) return;
  const m = await dbModules();
  const emp = employerId;
  try {
    await m.db.execute(m.sql`
      DELETE FROM financial_events WHERE source_id IN (
        SELECT id::text FROM invoices WHERE payer_employer_id = ${emp}
        UNION SELECT p.id::text FROM payments p JOIN service_engagements e ON e.id = p.service_engagement_id WHERE e.payer_employer_id = ${emp}
        UNION SELECT r.id::text FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN service_engagements e ON e.id = p.service_engagement_id WHERE e.payer_employer_id = ${emp})`);
    await m.db.execute(m.sql`
      DELETE FROM receipts WHERE payment_id IN (SELECT p.id FROM payments p
        JOIN service_engagements e ON e.id = p.service_engagement_id WHERE e.payer_employer_id = ${emp})`);
    await m.db.execute(m.sql`
      DELETE FROM payments WHERE service_engagement_id IN (
        SELECT id FROM service_engagements WHERE payer_employer_id = ${emp})`);
    await m.db.execute(m.sql`
      DELETE FROM invoice_line_items WHERE invoice_id IN (
        SELECT id FROM invoices WHERE payer_employer_id = ${emp})`);
    await m.db.execute(m.sql`DELETE FROM invoices WHERE payer_employer_id = ${emp}`);
    await m.db.execute(m.sql`DELETE FROM service_engagements WHERE payer_employer_id = ${emp}`);
    await m.db.execute(m.sql`DELETE FROM leads WHERE employer_id = ${emp}`);
    await m.db.execute(m.sql`DELETE FROM job_requisitions WHERE employer_id = ${emp}`);
    await m.db.execute(m.sql`DELETE FROM employers WHERE id = ${emp}`);
  } catch (e) {
    console.warn('rec-p0-fin cleanup incomplete:', (e as Error).message);
  }
});

test('employer pays the €1,500 fee from the employer page; the enquiry converts with that invoice — one charge only', async ({
  page,
}) => {
  const today = todayInDublin();

  // 1. Finance raises the fee from the employer page.
  await openEmployerBilling(page);
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.getByTestId('menu-generate-invoice').click();
  const gen = page.getByRole('dialog');
  await expect(gen.getByRole('heading', { name: 'Generate invoice' })).toBeVisible();
  const feeOption = gen.locator('#gi-service option', { hasText: /placement fee/i }).first();
  await gen
    .locator('#gi-service')
    .selectOption({ value: (await feeOption.getAttribute('value')) ?? '' });
  await gen.locator('#gi-unit-price').fill('1500.00');
  await gen.getByRole('button', { name: 'Generate invoice' }).click();
  await page.waitForURL(/\/employers\/[^/]+\/invoices\//, { timeout: 30_000 });
  const invoiceNumber = decodeURIComponent(page.url().split('/invoices/')[1] ?? '').split('?')[0];
  expect(invoiceNumber).toMatch(/^INV-/);

  // 2. The employer pays; finance records it on Billing (date = today).
  await openEmployerBilling(page);
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  const pay = page.getByRole('dialog');
  await expect(pay.locator('#rp-received')).toHaveValue(today);
  await pay.getByRole('button', { name: /Record \+ verify|Record payment/ }).click();
  await expect(pay).toBeHidden({ timeout: 20_000 });
  expect(await counts()).toMatchObject({ invoices: 1, payments: 1, receipts: 1 });

  // 3. Convert the enquiry from the Leads list.
  await page.goto(`/leads?assigned=all&q=${encodeURIComponent(`P0FIN-E2E ${STAMP}`)}`);
  const row = page.getByRole('row', { name: new RegExp(EMPLOYER) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Convert → open requisition/ }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByRole('heading', { name: 'Convert → open requisition' })).toBeVisible();

  // Defaults to the employer's paid invoice.
  const existing = dlg.getByRole('radio', { name: /Use an existing invoice/ });
  await expect(existing).toBeChecked({ timeout: 15_000 });
  const list = dlg.getByTestId('existing-invoice-list');
  await expect(list.getByText(invoiceNumber, { exact: true })).toBeVisible();
  await expect(list.getByText('Paid in full and verified by Finance')).toBeVisible();

  // The "new payment" form offers employer services only, dated today, and
  // warns that the employer already has this invoice.
  await dlg.getByRole('radio', { name: /Record a new payment/ }).check();
  const serviceNames = (await dlg.locator('#convertService option').allTextContents()).filter(
    (n) => !n.startsWith('—'),
  );
  expect(serviceNames.length).toBeGreaterThan(0);
  expect(serviceNames.some((n) => /placement fee/i.test(n))).toBe(true);
  for (const personOnly of ['CV & Cover Letter', 'Candidate Onboarding', 'Info Session']) {
    expect(serviceNames).not.toContain(personOnly);
  }
  await expect(dlg.locator('#convertReceivedAt')).toHaveValue(today);
  await expect(dlg.getByText(`This employer already has invoice ${invoiceNumber}.`)).toBeVisible();

  // Convert using the paid invoice — one clear confirmation.
  await existing.check();
  await dlg.getByRole('button', { name: `Convert using ${invoiceNumber}` }).click();
  await page.waitForURL(/\/requisitions\/[0-9a-f-]{36}/, { timeout: 30_000 });

  // 4. Still exactly one invoice, one payment, one receipt — linked to the enquiry.
  expect(await counts()).toMatchObject({ invoices: 1, payments: 1, receipts: 1 });
  const m = await dbModules();
  const [inv] = await m.db.execute<{ source_lead_id: string; job_requisition_id: string }>(
    m.sql`SELECT source_lead_id, job_requisition_id FROM invoices WHERE number = ${invoiceNumber}`,
  );
  expect(inv?.source_lead_id).toBe(leadId);
  expect(page.url()).toContain(inv?.job_requisition_id ?? 'missing');
  const [lead] = await m.db.execute<{ status: string; conversion_method: string }>(
    m.sql`SELECT status, conversion_method FROM leads WHERE id = ${leadId}`,
  );
  expect(lead).toMatchObject({ status: 'CONVERTED', conversion_method: 'PAYMENT_VERIFIED' });

  // 5. Employer Billing shows the one invoice, settled.
  await openEmployerBilling(page);
  await expect(page.getByRole('link', { name: /^Open invoice INV-/ })).toHaveCount(1);
  await expect(page.getByRole('link', { name: `Open invoice ${invoiceNumber}` })).toBeVisible();
});

test('/payments → Record payment defaults the received date to today (Dublin)', async ({
  page,
}) => {
  await page.goto('/payments');
  const trigger = page.getByRole('button', { name: 'Record payment' }).first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  test.skip(await trigger.isDisabled(), 'No open engagement to record against on this DB.');
  await trigger.click();
  await expect(page.getByRole('dialog').locator('#p-received')).toHaveValue(todayInDublin());
});
